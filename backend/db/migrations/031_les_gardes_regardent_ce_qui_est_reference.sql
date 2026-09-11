-- =====================================================================================
--  031 — LES GARDES REGARDENT CE QUI EST RÉFÉRENCÉ, PAS LE NOM DE LA COLONNE
--
--  §0  Le périmètre de la migration
--  §1  La clé de portée se reconnaît à ce qu'elle RÉFÉRENCE                    — A-2
--  §2  La barrière document ↔ traitement a son garde                          — A-2
--  §3  `f_domaine_accepte()` rend son verdict, et QUELQU'UN l'appelle          — A-1, A-7
--  §4  Un garde n'ÉVALUE pas un prédicat qui peut agir                         — A-4
--  §5  « Éprouvée » n'est pas « validée » — et la réserve de `025` tombe       — A-8
--  §6  Le déclencheur de portée répond à TOUTE modification                    — A-9
--  §7  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Le 9ᵉ passage de la porte S8 a refusé le lot de la veille, et **les deux constats qui
--  portent le refus visent les gardes écrits pour fermer le passage précédent**. C'est la
--  quatrième porte de suite où le bloquant — ou ce qui en tient lieu — vit dans le
--  correctif accepté au passage d'avant.
--
--  ── A-2, et c'est le plus embarrassant ───────────────────────────────────────────────
--
--  `f_verifier_references_portee()` — renforcé la veille **pour cette classe précise**
--  (constat Q-297) — reconnaît une clé composite à ceci : *l'une de ses colonnes
--  référençantes s'appelle `filiale_id`*. La migration `030` a nommé la sienne
--  `traitement_filiale_id`. **Le garde ne voit donc ni l'une ni l'autre des deux clés
--  qu'elle pose**, et les cinq pièces de sa barrière se retirent en silence :
--
--      NE MORD PAS | supprimer trg_documents_traitement_portee
--      NE MORD PAS | supprimer ck_documents_traitement_groupe   → **N-10 rouvert**
--      NE MORD PAS | supprimer ck_documents_traitement_filiale  → **lien inter-filiales**
--      NE MORD PAS | supprimer fk_documents_traitement_coherence
--      NE MORD PAS | supprimer fk_documents_traitement_portee
--
--  Mesuré ensuite jusqu'au bout, sur une base jetable : la PSSI de portée Groupe désigne le
--  traitement LOCAL d'une filiale, un document de Toulouse désigne le traitement allemand,
--  et `f_verifier_schema()` rend **0 anomalie** dans les trois cas.
--
--  ⚠️ **Le schéma livré, lui, est juste** — le cloisonnement rend 110/110 et trente-quatre
--  sondes hostiles n'ont rien percé. Ce qui manquait est la barrière contre la RÉGRESSION,
--  c'est-à-dire exactement ce que le contrôle **S16** mesure.
--
--  ⚠️ **Et la leçon est celle que le `CONVENTIONS.md` §39 venait d'écrire, retournée contre
--  lui** : *reconnaître un NOM au lieu de mesurer ce qu'une chose FAIT*. Le §39.3 disait
--  « le balayage part du catalogue, jamais de la liste » ; il partait bien du catalogue, et
--  y lisait un nom local que rien n'oblige. Le catalogue dit **ce qui est référencé**
--  (`confkey`), et c'est cela qui ne se renomme pas sans conséquence.
--
--  ── A-1 : un garde-fou livré la veille et que PERSONNE n'appelle ─────────────────────
--
--  `f_domaine_accepte()` a été livrée par la `028` §2, inscrite en règle au §39.1 du
--  `CONVENTIONS.md` — et **aucun garde-fou ne l'appelle**. Deux fichiers la mentionnent :
--  celui qui la crée, et celui qui promet qu'on s'en sert. Conséquence mesurée : la
--  mutation sournoise de Q-292 fonctionne encore **sur les domaines** —
--
--      alter domain id_metier drop constraint id_metier_check;
--      alter domain id_metier add  constraint id_metier_check check (value <> '' or true);
--      → f_verifier_schema() : 0 anomalie
--      → insert into risques (id, …) values ('', …)          : ACCEPTÉ
--      → insert into risques (id, …) values ('  RSK-1  ', …) : ACCEPTÉ
--
--  — c'est-à-dire **Q-310, donc Q-194, rouverts par la migration écrite le même jour pour
--  les fermer**. *Un garde-fou que rien n'invoque est un commentaire*, et celui-ci a été
--  livré par la migration qui porte ce contrôle en titre.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §5 VALIDE une contrainte posée `not valid` : `validate constraint` parcourt la table,
-- qui est cloisonnée, et `force row level security` vaut aussi pour le propriétaire. Sans
-- réglage, la migration échouerait en GRC04 sans nommer sa cause (motif du §0 de la `012`).

do $$
begin
    perform set_config('grc.utilisateur', 'migration-031', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — A-2 : LA CLÉ DE PORTÉE SE RECONNAÎT À CE QU'ELLE RÉFÉRENCE
-- =====================================================================================
--
-- Une clé composite vers une table MIXTE est « à risque » quand l'une de ses colonnes
-- référençantes **vise `<cible>.filiale_id`** et qu'elle est NULLABLE — la règle « match
-- simple » neutralise alors la clé entière pour toute ligne de portée Groupe. Le nom LOCAL
-- de cette colonne n'a aucune importance : `filiale_id`, `traitement_filiale_id`, ou tout
-- autre. Ce qui compte est la colonne VISÉE, et le catalogue la donne — `confkey`.
--
-- La compagne attendue vise `<cible>.portee_groupe`, qui n'est jamais nulle, et **protège
-- les mêmes colonnes** : celles dont la cible n'est ni `filiale_id` ni `portee_groupe`.

create or replace function f_paires_de_portee()
returns table (contrainte oid, source oid, cible oid, locale name, visee name)
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    -- Chaque couple (colonne référençante, colonne visée) d'une clé étrangère, à plat.
    -- ⚠️ `unnest(a, b)` les parcourt EN PARALLÈLE : c'est ce qui donne l'appariement, et
    -- c'est la seule forme qui le donne sans supposer un ordre.
    select con.oid, con.conrelid, con.confrelid,
           (select a.attname from pg_attribute a
             where a.attrelid = con.conrelid and a.attnum = z.k),
           (select a.attname from pg_attribute a
             where a.attrelid = con.confrelid and a.attnum = z.f)
      from pg_constraint con,
           lateral unnest(con.conkey, con.confkey) as z(k, f)
     where con.contype = 'f';
$$;

comment on function f_paires_de_portee() is
    'Met à plat l''appariement (colonne référençante → colonne visée) de toute clé '
    'étrangère. ⚠️ Elle existe parce que f_verifier_references_portee() reconnaissait une '
    'clé de cloisonnement au NOM LOCAL de sa colonne — « filiale_id » —, et que la migration '
    '030 a nommé la sienne « traitement_filiale_id » : les deux moitiés de sa barrière '
    'étaient invisibles, et N-10 se rouvrait en retirant une ligne (constat A-2 du 9ᵉ '
    'passage de la porte S8). Ce qui ne se renomme pas sans conséquence est la colonne '
    'VISÉE, et le catalogue la donne.';

create or replace function f_verifier_references_portee()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    for r in
        -- Toute clé étrangère COMPOSITE dont une colonne référençante VISE le `filiale_id`
        -- d'une table MIXTE, et qui est nullable.
        select con.conname::text   as contrainte,
               src.relname::text   as source,
               cible.relname::text as cible,
               con.oid             as con_oid,
               con.conrelid        as src_oid,
               con.confrelid       as cible_oid,
               -- LES COLONNES PROTÉGÉES : ce que cette clé vérifie vraiment, c'est-à-dire
               -- tout sauf la colonne de cloisonnement.
               --
               -- ⚠️ **Nommées par leur colonne LOCALE, et c'est le constat Q-297.** On
               -- RECONNAÎT la clé par ce qu'elle RÉFÉRENCE — un nom local se change, et
               -- c'est ce qui avait rendu la paire de la `030` invisible (A-2). Mais on
               -- l'APPARIE par sa colonne locale : deux clés d'une même table vers la même
               -- cible référencent toutes deux `<cible>.id`, et les comparer par la cible
               -- ferait d'une compagne posée sur une AUTRE colonne une compagne valable —
               -- exactement le défaut que Q-297 a fermé. *Les deux moitiés sont
               -- nécessaires, et chacune a coûté un passage de porte.*
               (select array_agg(p.locale::text order by p.locale)
                  from f_paires_de_portee() p
                 where p.contrainte = con.oid and p.visee <> 'filiale_id') as locales_protegees
          from pg_constraint con
          join pg_class     src   on src.oid = con.conrelid
          join pg_class     cible on cible.oid = con.confrelid
          join pg_namespace n     on n.oid = src.relnamespace and n.nspname = 'public'
         where con.contype = 'f'
           and array_length(con.conkey, 1) > 1
           and cible.relname::text in (select nom from f_tables_mixtes())
           and exists (
                 select 1 from f_paires_de_portee() p
                   join pg_attribute a on a.attrelid = con.conrelid and a.attname = p.locale
                  where p.contrainte = con.oid
                    and p.visee = 'filiale_id'
                    and not a.attnotnull)
         order by 1
    loop
        if not exists (
            select 1
              from pg_constraint c2
             where c2.contype = 'f'
               and c2.conrelid = r.src_oid
               and c2.confrelid = r.cible_oid
               and exists (select 1 from f_paires_de_portee() p2
                            where p2.contrainte = c2.oid and p2.visee = 'portee_groupe')
               -- ══ Q-297 : *LA* compagne, pas *UNE* compagne ═════════════════════
               and (select array_agg(p2.locale::text order by p2.locale)
                      from f_paires_de_portee() p2
                     where p2.contrainte = c2.oid and p2.visee <> 'portee_groupe')
                   = r.locales_protegees)
        then
            objet    := r.source || '.' || r.contrainte;
            anomalie := 'reference_portee_sans_compagne';
            detail   := format(
                'Cette clé étrangère composite vise « %s », qui est MIXTE, par une colonne '
                'référençant son filiale_id NULLABLE : quand cette colonne est nulle — '
                'c''est-à-dire pour toute ligne de portée Groupe — la règle « match simple » '
                'la neutralise et elle ne vérifie plus RIEN. Il manque une seconde clé vers '
                '« %s » passant par sa colonne engendrée portee_groupe, qui n''est jamais '
                'nulle, ET protégeant LES MÊMES colonnes référençantes (%s). Sans elle, une ligne '
                'de portée GROUPE peut désigner une ligne LOCALE d''une filiale, et la '
                'suppression ordinaire de celle-ci emporte le socle commun (constat N-10, '
                'porte S1). ⚠️ Ce garde regarde ce que les colonnes RÉFÉRENCENT, jamais leur '
                'nom local : il a manqué les deux clés de la migration 030 parce qu''elles '
                'nomment la leur « traitement_filiale_id » (constat A-2, 9ᵉ passage de S8).',
                r.cible, r.cible, array_to_string(r.locales_protegees, ', '));
            return next;
        end if;
    end loop;
    return;
end;
$$;

comment on function f_verifier_references_portee() is
    'Toute clé étrangère composite visant le filiale_id NULLABLE d''une table MIXTE a une '
    'compagne visant son portee_groupe ET protégeant LES MÊMES colonnes. ⚠️ Le garde regarde '
    'ce que les colonnes RÉFÉRENCENT (confkey), jamais leur nom local : reconnaître le nom '
    '« filiale_id » lui faisait manquer les deux clés de la migration 030, dont la colonne '
    's''appelle « traitement_filiale_id » — et N-10 se rouvrait en retirant une ligne '
    '(constat Q-297 puis A-2, deux passages de suite sur le même garde).';

-- =====================================================================================
-- §2 — A-2 : LA BARRIÈRE DOCUMENT ↔ TRAITEMENT A SON GARDE
-- =====================================================================================
--
-- Le §1 ferme la CLASSE — une clé composite sans compagne est vue, quel que soit le nom de
-- ses colonnes. Il ne ferme pas le cas où **les deux** clés disparaissent : il n'y a alors
-- plus de clé composite à examiner, et le garde de classe se tait légitimement.
--
-- Les cinq pièces de la `030` forment **une barrière nommée**, comme celle de la
-- publication (`f_verifier_publication_documents()`), et se gardent de la même façon : on
-- vérifie qu'elles sont là, et l'on ÉPROUVE les deux `check` par des témoins (§39.1).

create or replace function f_verifier_barriere_traitement()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r         record;
    v_accepte boolean;
begin
    /* ── 1. LES DEUX COLONNES, avec leur nature ─────────────────────────────────── */
    if not exists (
        select 1 from pg_attribute a
         where a.attrelid = to_regclass('public.documents')
           and a.attname = 'traitement_filiale_id' and a.attnum > 0 and not a.attisdropped)
    then
        objet    := 'documents.traitement_filiale_id';
        anomalie := 'colonne_de_portee_absente';
        detail   := 'La colonne qui matérialise LA FILIALE DU TRAITEMENT VISÉ a disparu. '
                    'Sans elle, « même filiale OU cible de portée Groupe » redevient une '
                    'disjonction qu''aucune clé étrangère ne sait exprimer (constat Q-294).';
        return next;
    end if;

    if not exists (
        select 1 from pg_attribute a
         where a.attrelid = to_regclass('public.documents')
           and a.attname = 'traitement_portee_groupe' and a.attnum > 0
           and not a.attisdropped and a.attgenerated <> '')
    then
        objet    := 'documents.traitement_portee_groupe';
        anomalie := 'colonne_de_portee_non_engendree';
        detail   := 'La colonne de portée du traitement visé a disparu, ou elle n''est plus '
                    'ENGENDRÉE : une valeur qu''on peut écrire ment, là où une valeur '
                    'déduite ne peut pas.';
        return next;
    end if;

    /* ── 2. LES DEUX CLÉS ÉTRANGÈRES ────────────────────────────────────────────── */
    for r in
        select * from (values
            ('fk_documents_traitement_coherence', 'filiale_id'),
            ('fk_documents_traitement_portee',    'portee_groupe')) as v(nom, visee)
    loop
        if not exists (
            select 1 from pg_constraint con
             where con.conrelid = to_regclass('public.documents')
               and con.conname  = r.nom
               and con.contype  = 'f'
               and con.confrelid = to_regclass('public.traitements')
               and exists (select 1 from f_paires_de_portee() p
                            where p.contrainte = con.oid and p.visee = r.visee::name))
        then
            objet    := 'documents.' || r.nom;
            anomalie := 'cle_de_portee_absente';
            detail   := format(
                'La clé étrangère « %s » vers « traitements » a disparu, ou elle ne vise '
                'plus « %s ». Mesuré au 9ᵉ passage de la porte S8 : son retrait laissait '
                'un document désigner un traitement INEXISTANT, ou celui d''une AUTRE '
                'filiale, sous un f_verifier_schema() à zéro anomalie.', r.nom, r.visee);
            return next;
        end if;
    end loop;

    /* ── 3. LES DEUX « CHECK », ÉPROUVÉS PAR DES TÉMOINS (§39.1) ────────────────── */
    --
    -- ⚠️ On n'exige pas qu'elles EXISTENT : on exige qu'elles REFUSENT. Une contrainte
    -- vidée de sa substance passerait la première épreuve et pas la seconde — c'est tout
    -- l'objet du constat Q-292.
    for r in
        select * from (values
            ('ck_documents_traitement_groupe',
             '{"filiale_id": null, "traitement_filiale_id": "FIL-TEMOIN"}',
             'un document de portée GROUPE qui désigne un traitement LOCAL — le constat '
             'N-10 de la porte S1 : le socle commun ne doit pas dépendre d''une ligne '
             'qu''UNE filiale peut effacer'),
            ('ck_documents_traitement_filiale',
             '{"filiale_id": "FIL-A", "traitement_filiale_id": "FIL-B"}',
             'un document qui désigne le traitement d''une AUTRE filiale — un lien '
             'inter-filiales')) as v(nom, temoin, pourquoi)
    loop
        v_accepte := f_contrainte_accepte('documents', r.nom, r.temoin::jsonb);
        if v_accepte is null then
            objet    := 'documents.' || r.nom;
            anomalie := 'barriere_traitement_non_eprouvable';
            detail   := format('La contrainte « %s » est introuvable, ou son prédicat n''a '
                               'pas pu être évalué. ⚠️ « Je n''ai pas pu mesurer » ne vaut '
                               'pas « c''est bon ». Ce qu''elle doit refuser : %s.',
                               r.nom, r.pourquoi);
            return next;
        elsif v_accepte then
            objet    := 'documents.' || r.nom;
            anomalie := 'barriere_traitement_laisse_passer';
            detail   := format('La contrainte « %s » ACCEPTE %s. Elle existe peut-être '
                               'encore, et son nom est le bon : c''est sa substance qui est '
                               'partie (constat Q-292).', r.nom, r.pourquoi);
            return next;
        end if;
    end loop;

    /* ── 4. LE DÉCLENCHEUR QUI ALIMENTE LA COLONNE ─────────────────────────────── */
    --   tgtype : 1 = ROW, 2 = BEFORE, 4 = INSERT, 16 = UPDATE.
    if not exists (
        select 1 from pg_trigger t
         where t.tgrelid = to_regclass('public.documents')
           and not t.tgisinternal
           and t.tgname = 'trg_documents_traitement_portee'
           and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2
           and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16
           and t.tgenabled = 'A')
    then
        objet    := 'documents.trg_documents_traitement_portee';
        anomalie := 'declencheur_de_portee_non_arme';
        detail   := 'Le déclencheur qui POSE la filiale du traitement visé manque, ne répond '
                    'pas à « before insert OR UPDATE … for each row », ou n''est pas armé '
                    '« always ». Sans lui, la colonne serait CRUE telle que le client '
                    'l''envoie — c''est-à-dire un oracle d''existence inter-filiales : il '
                    'suffirait d''envoyer la filiale qui arrange pour satisfaire la clé de '
                    'cohérence (constat Q-294).';
        return next;
    end if;
    return;
end;
$$;

comment on function f_verifier_barriere_traitement() is
    'Les cinq pièces de la barrière document ↔ traitement (migration 030) : deux colonnes, '
    'deux clés étrangères, deux « check » ÉPROUVÉS par témoins, et le déclencheur qui '
    'alimente la colonne. ⚠️ Posé après le 9ᵉ passage de la porte S8 (constat A-2) : les '
    'cinq se retiraient une par une sous un f_verifier_schema() à zéro anomalie, et le '
    'retrait de deux d''entre elles rouvrait le constat N-10 ou ouvrait un lien '
    'inter-filiales. Le garde de CLASSE — f_verifier_references_portee() — ne peut pas voir '
    'la disparition des DEUX clés d''une paire : il n''y a alors plus de clé à examiner.';

grant execute on function f_paires_de_portee() to grc_app;
grant execute on function f_verifier_barriere_traitement() to grc_app;

-- =====================================================================================
-- §3 — A-1 et A-7 : `f_domaine_accepte()` REND SON VERDICT, ET QUELQU'UN L'APPELLE
-- =====================================================================================
--
-- Deux défauts, et le second explique le premier.
--
-- **A-7** : la fonction calculait `v_ok` puis rendait `true` sans jamais le lire. Le
-- discriminant réel était l'échec de la conversion — défendable, mais une variable calculée
-- puis jetée **dans un outil de mesure neuf** est une intention perdue. Elle rendait
-- notamment `true` sur `NULL`, qu'aucun domaine ne refuse.
--
-- **A-1** : personne ne s'en était aperçu **parce que rien ne l'appelle**. Elle a été
-- livrée par la `028` §2 et inscrite en règle au `CONVENTIONS.md` §39.1 ; deux fichiers la
-- mentionnent, celui qui la crée et celui qui promet qu'on s'en sert. *Un garde-fou que
-- rien n'invoque est un commentaire* — appliqué à un garde livré par la migration qui
-- porte ce contrôle en titre.

create or replace function f_domaine_accepte(p_domaine text, p_valeur text)
returns boolean
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_ok boolean;
begin
    if to_regtype(p_domaine) is null then
        return null;
    end if;
    begin
        -- ⚠️ On LIT le verdict — constat A-7. La conversion peut réussir en rendant NULL
        -- (aucun domaine ne refuse le nul), et rendre « accepté » sur un nul ferait dire à
        -- ce garde que le domaine admet ce qu'il n'a jamais examiné.
        execute format('select ($1::%s) is not null', p_domaine) into v_ok using p_valeur;
        return coalesce(v_ok, p_valeur is null);
    exception when others then
        return false;
    end;
end;
$$;

comment on function f_domaine_accepte(text, text) is
    'ÉPROUVE un domaine : tente la conversion d''une valeur témoin et LIT le verdict. '
    'Pendant de f_contrainte_accepte() pour les domaines (constat Q-292). ⚠️ Elle rendait '
    '« accepté » sans lire son propre calcul, et personne ne l''avait vu parce que RIEN NE '
    'L''APPELAIT — constats A-7 et A-1 du 9ᵉ passage de la porte S8.';

-- ── LE GARDE QUI L'EMPLOIE ───────────────────────────────────────────────────────────
--
-- ⚠️ **La mutation que ce garde existe pour voir**, jouée par l'auditeur :
--
--     alter domain id_metier drop constraint id_metier_check;
--     alter domain id_metier add  constraint id_metier_check check (value <> '' or true);
--     → f_verifier_schema() : 0 anomalie
--     → insert into risques (id, …) values ('', …) : ACCEPTÉ
--
-- C'est **Q-310, donc Q-194, rouverts** par la migration écrite le même jour pour les
-- fermer. Le domaine `type_entite` se vide de la même façon, et il borne le lien polymorphe
-- des pièces jointes — c'est-à-dire la cascade de la migration `017`.

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
                    'ininterprétable (migration 020)')
    );
    v_temoin  jsonb;
    v_accepte boolean;
begin
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
    return;
end;
$$;

comment on function f_verifier_domaines_eprouves() is
    'ÉPROUVE les six domaines du schéma : quinze valeurs témoins, dans les DEUX sens. ⚠️ Il '
    'existe parce que f_domaine_accepte() a été livrée, inscrite en règle — et appelée par '
    'PERSONNE : les domaines id_metier et type_entite se vidaient par « … or true » sous un '
    'f_verifier_schema() à zéro anomalie, ce qui rouvrait les constats Q-310 et Q-194 le '
    'jour même où une migration les fermait (constat A-1, 9ᵉ passage de la porte S8).';

grant execute on function f_verifier_domaines_eprouves() to grc_app;

-- =====================================================================================
-- §4 — A-4 : UN GARDE N'ÉVALUE PAS UN PRÉDICAT QUI PEUT AGIR
-- =====================================================================================
--
-- `f_contrainte_accepte()` évalue le prédicat réel d'une contrainte, et la `028` §2
-- déclarait cette surface inerte :
--
--   « ⚠️ Ce qui est exécuté ne vient pas d'un utilisateur : `pg_get_expr` rend l'expression
--   telle que le catalogue la détient, et les valeurs témoins voyagent en PARAMÈTRE. »
--
-- Les **valeurs** voyagent en paramètre — c'est vrai. Mais c'est le **prédicat** qui est
-- concaténé et exécuté, et la phrase ne disait rien de ce qu'il peut faire.
--
-- ⚠️ **MESURÉ PAR L'ORCHESTRATEUR, ET LE MÉCANISME N'EST PAS CELUI QUE LE RAPPORT
-- ANNONÇAIT** — c'est pourquoi on revérifie :
--
--     (a) une fonction STABLE qui écrit DIRECTEMENT :
--         ERROR: INSERT is not allowed in a non-volatile function      ← PostgreSQL refuse
--     (b) une fonction STABLE qui appelle une VOLATILE qui écrit :
--         f_contrainte_accepte rend : true ·  1 ligne écrite           ← elle passe
--
-- Le marqueur `stable` bloque donc l'écriture **directe** et rien de plus : un appel de
-- profondeur un suffit. Et `f_verifier_schema()` étant `security definer`, l'écriture se
-- fait **sous l'identité du propriétaire** — `install.sh --diagnostic`, joué en root sur la
-- machine de production, passe par ce même chemin.
--
-- ⚠️ **Le modèle de menace, dit honnêtement** : poser la charge exige un `alter table`,
-- donc les droits du propriétaire. Ce n'est **pas** une escalade depuis le rôle applicatif
-- seul. C'est une **frontière de confiance neuve**, que la migration déclarait inexistante
-- sans l'avoir mesurée — la leçon de Q-291 retournée contre le §1 qui la formule.
--
-- ── LE REMÈDE, ET POURQUOI IL NE COÛTE RIEN ─────────────────────────────────────────
--
-- `pg_depend` ne suit PAS les appels d'un corps PL/pgSQL : interroger la volatilité des
-- fonctions directement référencées ne verrait pas l'appel de profondeur un. On refuse donc
-- d'évaluer tout prédicat qui référence une fonction **non native** — non épinglée au
-- catalogue (`pg_depend.deptype = 'p'`). Mesuré : sur les **150 contraintes « check » du
-- schéma, AUCUNE** ne référence une fonction du produit. La règle ne retire donc rien, et
-- le refus est **bruyant** : l'appelant reçoit `null`, qu'il traite déjà en
-- « contrainte_non_eprouvable » — *« je n'ai pas pu mesurer » ne vaut pas « c'est bon »*.

create or replace function f_contrainte_accepte(
    p_table      text,
    p_contrainte text,
    p_valeurs    jsonb
) returns boolean
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_predicat text;
    v_oid      oid := to_regclass('public.' || quote_ident(p_table));
    v_con      oid;
    v_resultat boolean;
begin
    if v_oid is null then
        return null;
    end if;

    select k.oid, pg_get_expr(k.conbin, k.conrelid) into v_con, v_predicat
      from pg_constraint k
     where k.conrelid = v_oid and k.conname = p_contrainte and k.contype = 'c';

    if v_predicat is null then
        return null;
    end if;

    -- ══ ON N'ÉVALUE PAS UN PRÉDICAT QUI PEUT AGIR — constat A-4 ══════════════════
    -- Une fonction NON ÉPINGLÉE est une fonction que quelqu'un a créée ici. Elle peut
    -- écrire — directement si elle est volatile, par un appel de profondeur un même si
    -- elle se déclare `stable` —, et cette évaluation se fait sous l'identité du
    -- PROPRIÉTAIRE quand elle passe par `f_verifier_schema()`.
    if exists (
        select 1 from pg_depend d
          join pg_proc p on p.oid = d.refobjid
         where d.objid = v_con
           and d.classid = 'pg_constraint'::regclass
           and d.refclassid = 'pg_proc'::regclass
           and not exists (select 1 from pg_depend pin
                            where pin.objid = p.oid
                              and pin.classid = 'pg_proc'::regclass
                              and pin.deptype = 'p'))
    then
        return null;   -- « je n'ai pas pu mesurer » : l'appelant le dit, et c'est le but
    end if;

    -- `jsonb_populate_record(null::<table>, …)` rend une ligne du bon TYPE : les colonnes
    -- absentes de l'objet valent nul, et `.*` les expose sous leur nom, si bien que les
    -- références de colonnes du prédicat s'y lient.
    begin
        execute format(
            'select (%s) from (select (jsonb_populate_record(null::%I, $1)).*) as t',
            v_predicat, p_table)
          into v_resultat
         using p_valeurs;
    exception when others then
        return null;
    end;

    -- « check » est satisfaite quand le prédicat est vrai OU nul.
    return coalesce(v_resultat, true);
end;
$$;

comment on function f_contrainte_accepte(text, text, jsonb) is
    'ÉPROUVE une contrainte « check » : évalue son prédicat réel sur une ligne témoin et '
    'rend ce que la base répondrait — accepté, refusé, ou « je n''ai pas pu mesurer » '
    '(null). ⚠️ Elle REFUSE d''évaluer un prédicat qui référence une fonction NON NATIVE : '
    'une telle fonction peut écrire — « stable » ne bloque que l''écriture DIRECTE, un appel '
    'de profondeur un suffit —, et l''évaluation se fait sous l''identité du propriétaire '
    'quand elle passe par f_verifier_schema() (constat A-4, 9ᵉ passage de la porte S8). '
    'Mesuré : aucune des 150 contraintes « check » du schéma ne référence une fonction du '
    'produit, la règle ne retire donc rien.';

-- =====================================================================================
-- §5 — A-8 : « ÉPROUVÉE » N'EST PAS « VALIDÉE », ET LA RÉSERVE DE `025` TOMBE
-- =====================================================================================
--
-- Deux moitiés, et elles se tiennent.
--
-- *(a)* Une contrainte reposée `not valid` conserve son prédicat : `f_contrainte_accepte()`
-- la juge donc **correctement**, et pourtant **les lignes déjà en base n'ont jamais été
-- vérifiées**. `f_verifier_vocabulaire_journal()` regardait `convalidated` ;
-- `f_verifier_contraintes_eprouvees()`, qui a vocation à couvrir la classe, ne le regardait
-- pas — *la propriété a été perdue en généralisant*.
--
-- *(b)* Une contrainte du schéma livré EST `not valid` :
-- `ck_pieces_jointes_en_vigueur_integre`. C'est **délibéré et écrit** (`025` §1 : « une
-- migration ne peut pas parcourir une table cloisonnée sans périmètre »). ⚠️ **Mais le
-- motif est tombé depuis** : les migrations `029` et `030` ouvrent chacune par un §0 qui
-- pose le périmètre du groupe entier, précisément pour qu'un `add constraint` puisse
-- balayer une table cloisonnée. *La technique qui lève la réserve a été inventée deux
-- migrations plus tard et n'a pas été appliquée en arrière — une réserve écrite n'est pas
-- une réserve traitée.*

do $$
declare v_ecarts integer;
begin
    -- On REGARDE avant de valider : si des lignes violent déjà la contrainte, la valider
    -- échouerait — et il vaut mieux le dire que faire échouer la migration sans motif.
    select count(*) into v_ecarts from pieces_jointes
     where en_vigueur and etat_integrite = 'ecart';
    if v_ecarts > 0 then
        raise exception 'Impossible de valider ck_pieces_jointes_en_vigueur_integre : % '
                        'pièce(s) en vigueur portent un écart d''intégrité. Traitez-les '
                        'avant de rejouer cette migration.', v_ecarts;
    end if;
end;
$$;

alter table pieces_jointes validate constraint ck_pieces_jointes_en_vigueur_integre;

comment on constraint ck_pieces_jointes_en_vigueur_integre on pieces_jointes is
    'Une pièce dont le rapprochement d''intégrité a rendu « ecart » ne peut pas porter '
    '« en vigueur » — elle ne fait plus référence (constat Q-285). ⚠️ Elle a été posée '
    '« not valid » par la migration 025, faute de savoir alors parcourir une table '
    'cloisonnée ; les migrations 029 et 030 ont inventé le §0 qui pose le périmètre du '
    'groupe entier, et la 031 l''applique en arrière. La réserve est levée (constat A-8).';

-- =====================================================================================
-- §6 — A-9 : LE DÉCLENCHEUR DE PORTÉE RÉPOND À TOUTE MODIFICATION
-- =====================================================================================
--
-- `before insert or update **of traitement_id**` : une modification qui ne nomme pas
-- `traitement_id` ne réveille pas le déclencheur. Mesuré par l'auditeur :
--
--     update documents set traitement_filiale_id = 'FIL-A' where traitement_id is null;
--     → traitement_id = null, traitement_filiale_id = FIL-A, portee = false
--
-- Le document ne relève d'aucun traitement et porte pourtant la filiale d'un traitement —
-- ce que le commentaire de la colonne exclut.
--
-- ⚠️ **Toutes les variantes DANGEREUSES étaient rattrapées** (l'auditeur les a jouées une
-- par une : viser la filiale voisine, prétendre la portée Groupe, prétendre une filiale sur
-- une cible Groupe), et le chemin n'est pas atteignable par l'API — la colonne est déclarée
-- `colonnesReservees`. **Ni fuite, ni escalade : une incohérence résiduelle.** Elle est
-- corrigée parce qu'un `update of` est une optimisation dont le coût est exactement ce genre
-- d'angle mort, et parce qu'elle disparaît en retirant deux mots.

drop trigger if exists trg_documents_traitement_portee on documents;
create trigger trg_documents_traitement_portee
    before insert or update on documents
    for each row execute function f_documents_traitement_portee();
alter table documents enable always trigger trg_documents_traitement_portee;

-- =====================================================================================
-- §7 — A-3 : LE REGISTRE NE S'ARRÊTE PLUS À LA FRONTIÈRE DU TEXTE
-- =====================================================================================
--
-- La `029` a renversé le balayage — *« toute colonne textuelle est candidate »* — et c'est
-- un vrai progrès. **Mais le renversement ne franchissait pas la frontière du texte**, et
-- la preuve du défaut était dans le registre lui-même :
--
--        table_nom   |  colonne   |   nature    | type_reel
--      ---------------+------------+-------------+-----------
--       journal_audit | adresse_ip | personnelle | inet
--
-- Une adresse IP **est** une donnée personnelle, et elle a été inscrite **à la main**,
-- parce que le balayage ne l'atteignait pas. La colonne jumelle, `sessions.adresse_ip`,
-- n'était **pas décidée** — la même donnée, du même type, dans la table voisine. Et les
-- huit colonnes `jsonb` n'étaient décidées par personne, dont `journal_audit.valeurs_avant`
-- et `valeurs_apres`, qui portent **par construction** une copie de toutes les colonnes que
-- le registre déclare `personnelle`.
--
-- C'est la forme exacte que Q-295 a fermée pour le texte — *une liste dont l'incomplétude
-- réussit en silence* —, fermée pour `text`, `varchar`, `bpchar`, et laissée ouverte pour
-- tout le reste.
--
-- ── LE RENVERSEMENT VA JUSQU'AU BOUT ────────────────────────────────────────────────
--
-- Toute colonne est candidate, **sauf** celles dont le TYPE est déclaré incapable de porter
-- une personne — et cette exclusion se déclare, comme celle des domaines (§ `029`). Un type
-- neuf dans le schéma fait rougir tant que personne ne l'a rangé.

create or replace function f_colonnes_candidates()
returns table (table_nom text, colonne text, type_base text)
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select c.relname::text, a.attname::text, coalesce(bt.typname, t.typname)::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t      on t.oid = a.atttypid
      left join pg_type bt on bt.oid = nullif(t.typbasetype, 0)
     where c.relkind = 'r'
       -- Les colonnes d'un DOMAINE sont écartées : le domaine est une forme close, et
       -- `f_verifier_domaines_textuels()` exige qu'un domaine neuf soit rangé.
       and t.typtype = 'b'
       -- ⚠️ LES TYPES QUI NE PEUVENT PAS PORTER UNE PERSONNE, déclarés ici et nulle part
       -- ailleurs. Un type neuf n'y est pas, donc ses colonnes sont candidates, donc
       -- elles sont réclamées : l'omission ÉCHOUE BRUYAMMENT (CONVENTIONS.md §39.3).
       and coalesce(bt.typname, t.typname)::text not in
           ('bool', 'date', 'int2', 'int4', 'int8', 'numeric', 'float4', 'float8',
            'timestamptz', 'timestamp', 'time', 'timetz', 'interval')
     order by 1, 2;
$$;

comment on function f_colonnes_candidates() is
    'Toute colonne susceptible de porter une donnée personnelle : TOUT, sauf les types '
    'déclarés incapables d''en porter une (un booléen, un entier, une date d''échéance) et '
    'les colonnes d''un DOMAINE, qui sont des formes closes gardées par ailleurs. ⚠️ Elle '
    'remplace le balayage TEXTUEL de la 029 : celui-ci s''arrêtait à la frontière du texte, '
    'et laissait hors du registre huit colonnes « jsonb » — dont journal_audit.valeurs_avant '
    'et valeurs_apres, qui portent par construction une copie de toutes les colonnes '
    'déclarées personnelles — et sessions.adresse_ip, quand journal_audit.adresse_ip avait '
    'dû être inscrite À LA MAIN (constat A-3, 9ᵉ passage de la porte S8).';

grant execute on function f_colonnes_candidates() to grc_app;
grant execute on function f_colonnes_candidates() to grc_lecture;

-- ── LE GARDE DU RANGEMENT DES TYPES ──────────────────────────────────────────────────
create or replace function f_verifier_types_ranges()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les types dont AUCUNE valeur ne peut être un nom, une adresse, un identifiant de
    -- personne. C'est une DÉCISION, et elle est ici parce qu'elle est ici qu'on l'applique.
    v_sans_personne constant text[] := array[
        'bool', 'date', 'int2', 'int4', 'int8', 'numeric', 'float4', 'float8',
        'timestamptz', 'timestamp', 'time', 'timetz', 'interval'
    ];
    -- Les types qui PEUVENT en porter, et dont les colonnes sont donc réclamées au registre.
    v_porteurs constant text[] := array[
        'text', 'varchar', 'bpchar',   -- la prose, les noms, les identifiants
        'jsonb', 'json',               -- un document figé recopie ce qu'on y a mis
        'inet', 'cidr', 'macaddr',     -- une adresse désigne un poste, donc une personne
        'xml', 'bytea'                 -- un contenu opaque : on ne présume rien
    ];
    r record;
begin
    for r in
        select distinct coalesce(bt.typname, t.typname)::text as nom
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_type t on t.oid = a.atttypid
          left join pg_type bt on bt.oid = nullif(t.typbasetype, 0)
         where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
           and t.typtype = 'b'
           and not (coalesce(bt.typname, t.typname)::text = any (v_sans_personne))
           and not (coalesce(bt.typname, t.typname)::text = any (v_porteurs))
         order by 1
    loop
        objet    := r.nom;
        anomalie := 'type_non_range';
        detail   := 'Un type de ce nom apparaît dans le schéma, et rien ne dit s''il peut '
                    'porter une donnée personnelle. Rangez-le dans '
                    'f_verifier_types_ranges() : « porteur » — ses colonnes seront alors '
                    'réclamées au registre de l''article 30 — ou « jamais une personne ». '
                    '⚠️ Ne pas répondre, c''est ce qu''a fait le renversement de la '
                    'migration 029 : il s''arrêtait au texte, et huit colonnes « jsonb » '
                    'échappaient au registre qu''on présente à un DPO (constat A-3).';
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_types_ranges() is
    'Tout type de base présent dans le schéma est RANGÉ : « porteur possible d''une donnée '
    'personnelle » ou « jamais une personne ». C''est le renversement du constat Q-295 '
    'appliqué à la frontière des TYPES, que la migration 029 n''avait pas franchie '
    '(constat A-3).';

grant execute on function f_verifier_types_ranges() to grc_app;

-- ── LE BALAYAGE DU REGISTRE EMPLOIE LES CANDIDATES, PLUS LES SEULES TEXTUELLES ───────
--
-- ⚠️ Le corps vient de `pg_get_functiondef()` ; deux différences seulement : le sens 1
-- part de `f_colonnes_candidates()`, et le sens 3 accepte désormais les types porteurs
-- non textuels (constat A-3).

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
    /* ── SENS 1 : TOUTE colonne candidate non décidée — constats Q-295 et A-3 ────────
       Le balayage part du CATALOGUE, jamais d'une liste, et il ne s'arrête plus à la
       frontière du texte : une colonne « jsonb » ou « inet » est réclamée comme une
       « text ». */
    for r in
        select t.table_nom, t.colonne
          from f_colonnes_candidates() t
         where t.table_nom <> 'colonnes_personnelles'
           and not (t.colonne = any (v_tracabilite))
           and not exists (select 1 from colonnes_personnelles p
                            where p.table_nom = t.table_nom and p.colonne = t.colonne)
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'colonne_personnelle_non_decidee';
        detail   := 'Cette colonne n''est PAS DÉCIDÉE au registre « colonnes_personnelles ». '
                    'Décidez : « personnelle » — avec sa finalité, sa base légale, sa durée '
                    'et ce qu''on en fait à l''expiration — ou « non_personnelle », avec sa '
                    'justification. ⚠️ « Non personnelle » est une réponse recevable ; ne '
                    'pas répondre ne l''est pas : la purge RGPD laisserait alors la donnée '
                    'en place en annonçant « terminé », et le registre qu''on présente au '
                    'DPO serait incomplet sans le dire. ⚠️ Si la colonne est une saisie '
                    'libre dont le sujet n''est pas une personne mais où un nom peut '
                    'figurer, le régime est « signaler » : le produit montre l''emplacement '
                    'à un humain au lieu d''effacer.';
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

    /* ── SENS 3 : une déclaration dont le TYPE dément le régime — Q-300 ──────────────
       La purge CHERCHE UN NOM dans la colonne : elle construit une comparaison textuelle,
       et un type non textuel la fait échouer — ce qui avorte la purge ENTIÈRE. ⚠️ Depuis
       le constat A-3 le registre déclare aussi des colonnes `jsonb` et `inet` : elles ont
       donc le droit d'exister au registre, mais PAS avec un régime qui cherche un nom. */
    for r in
        select p.table_nom, p.colonne, p.a_expiration,
               format_type(a.atttypid, a.atttypmod) as typ
          from colonnes_personnelles p
          join pg_class c on c.relname = p.table_nom
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_attribute a on a.attrelid = c.oid and a.attname = p.colonne
                             and a.attnum > 0 and not a.attisdropped
         where p.a_expiration in ('anonymiser', 'signaler')
           and not exists (select 1 from f_colonnes_textuelles() t
                            where t.table_nom = p.table_nom and t.colonne = p.colonne)
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'declaration_personnelle_de_mauvais_type';
        detail   := format(
            'Le registre déclare cette colonne « %s », et elle est de type « %s », qui '
            'n''est pas textuel. La purge y cherche un NOM : elle construit une comparaison '
            'textuelle, et la base la refuse. ⚠️ La purge est TRANSACTIONNELLE : une seule '
            'déclaration de ce genre l''avorte ENTIÈREMENT, pour toutes les filiales '
            '(constat Q-300). Déclarez « conserver » ou « supprimer », ou corrigez le nom '
            'de la colonne.', r.a_expiration, r.typ);
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_colonnes_personnelles() is
    'DANS TROIS SENS. (1) TOUTE colonne CANDIDATE du schéma — le balayage part du '
    'CATALOGUE, jamais d''une liste, et il ne s''arrête plus à la frontière du TEXTE '
    '(constats Q-295 puis A-3). (2) Toute déclaration désigne une colonne qui existe. '
    '(3) Toute déclaration dont le régime fait chercher un NOM porte sur une colonne '
    'TEXTUELLE (constat Q-300). ⚠️ Le seul écart est la traçabilité — « cree_par » / '
    '« modifie_par » portent un LOGIN déjà couvert par utilisateurs.identifiant.';

-- ── LES NEUF DÉCISIONS QUI MANQUAIENT ────────────────────────────────────────────────
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
    ('sessions', 'adresse_ip', 'personnelle',
     'Reconnaître un vol de session', 'Intérêt légitime', 30, 'supprimer',
     '⚠️ LA COLONNE JUMELLE DE journal_audit.adresse_ip, ET ELLE N''ÉTAIT PAS DÉCIDÉE — la '
     'même donnée, du même type, dans la table voisine (constat A-3). Une adresse IP '
     'désigne un poste, donc une personne. Durée COURTE, comme sessions.agent_utilisateur : '
     'une session expirée n''a plus à porter l''adresse d''où elle venait, et la trace '
     'durable vit dans le journal, qui a sa propre décision.'),
    ('journal_audit', 'valeurs_avant', 'personnelle',
     'Prouver ce qu''un enregistrement contenait avant une écriture', 'Obligation légale',
     1095, 'conserver',
     '⚠️ PAR CONSTRUCTION, cette colonne recopie les valeurs de la ligne écrite — donc de '
     'TOUTES les colonnes que ce registre déclare personnelles. C''est le différentiel '
     'd''audit, et il est INALTÉRABLE par dessein : l''anonymiser romprait la chaîne '
     'd''empreintes et détruirait la preuve. Article 17.3 ; la borne est la rétention de '
     'trois ans, pas une exception sans fin. Idem journal_audit.utilisateur_libelle.'),
    ('journal_audit', 'valeurs_apres', 'personnelle',
     'Prouver ce qu''un enregistrement contient après une écriture', 'Obligation légale',
     1095, 'conserver',
     'Idem journal_audit.valeurs_avant.'),
    ('audits', 'constats', 'personnelle',
     'Conserver les constats d''un audit, tels qu''ils ont été prononcés',
     'Intérêt légitime', 1095, 'conserver',
     '⚠️ Document FIGÉ, rédigé en prose par un auditeur, et qui nomme les interlocuteurs '
     'rencontrés — comme audits.synthese, déclarée « signaler ». CONSERVÉ et non « signaler » '
     'parce que le régime « signaler » cherche un nom dans du TEXTE, et que celui-ci est du '
     'jsonb : la purge ne sait pas y chercher, et prétendre le contraire ferait échouer la '
     'purge entière (constat Q-300). ⚠️ Ce que cela laisse ouvert est DIT : un nom présent '
     'ici ne sera pas signalé à l''humain qui purge.'),
    ('audits', 'items', 'personnelle',
     'Conserver la grille d''un audit, telle qu''elle a été remplie', 'Intérêt légitime',
     1095, 'conserver', 'Idem audits.constats.'),
    ('scenarios_pra', 'etapes_pra', 'personnelle',
     'Conserver les étapes RACI d''un scénario de reprise', 'Intérêt légitime', 1095,
     'conserver',
     'Document FIGÉ dont les étapes portent des RÔLES, et souvent le nom de qui les tient. '
     'Idem audits.constats : conservé parce que la purge ne cherche pas dans du jsonb, et '
     'la limite est dite.'),
    ('scenarios_pra', 'etapes_pca', 'personnelle',
     'Conserver les étapes RACI d''un scénario de continuité', 'Intérêt légitime', 1095,
     'conserver', 'Idem scenarios_pra.etapes_pra.'),
    ('prestataires', 'supply_chain', 'personnelle',
     'Décrire la chaîne d''approvisionnement d''un prestataire (NIS2, DORA)',
     'Obligation légale', 1095, 'conserver',
     'Document FIGÉ qui peut nommer un contact chez un sous-traitant. Idem audits.constats.'),
    ('history', 'metrics', 'non_personnelle', null, null, null, null,
     'Indicateurs AGRÉGÉS du tableau de bord — des comptes et des moyennes, un point par '
     'jour. Aucune ligne nominative n''y entre : ce sont des nombres, et le balayage de '
     'vérification de la purge le confirmerait si l''un d''eux devenait une chaîne.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §8 — A-5 et A-6 : LE REGISTRE CESSE D'AFFIRMER CE QU'IL NE PEUT PAS TENIR
-- =====================================================================================
--
-- **A-5.** Quatre-vingt-deux déclarations motivent leur `non_personnelle` par la formule
-- *« Vocabulaire clos ou valeur technique […] Aucune saisie libre »*. **Dix-huit portent sur
-- une colonne `text` nue, sans contrainte ni domaine** — c'est-à-dire que la justification
-- affirme une borne qui n'existe pas. C'est la classe de Q-291 : *affirmer au lieu de
-- poser*. La majorité est bénigne (un type MIME, un numéro de version) ; **trois ne le sont
-- pas**, et la frontière que le registre s'est lui-même donnée les range ailleurs.
--
-- **A-6.** `pieces_jointes.nom_fichier` et `imports.nom_fichier` sont déclarées
-- `non_personnelle` sans régime, et leur justification **argumente sur le CONTENU du
-- fichier quand la colonne porte son NOM**. La question posée — *un nom de personne peut-il
-- figurer là ?* — n'est pas traitée. `CV_Jean_DUPONT.pdf` est stocké mot pour mot, et
-- renvoyé dans l'en-tête `content-disposition`. L'incohérence est **interne à une seule
-- table** : la `description` de `pieces_jointes`, saisie libre, est déclarée `signaler` ; le
-- `nom_fichier`, saisie libre où un nom figure plus souvent encore, n'est rien.

update colonnes_personnelles set
    nature = 'personnelle',
    finalite = 'Retrouver une pièce jointe par son nom',
    base_legale = 'Intérêt légitime',
    duree_jours = 1095,
    a_expiration = 'signaler',
    justification =
      '⚠️ LE NOM du fichier, et la question est CELLE-LÀ — la rédaction précédente '
      'argumentait sur le CONTENU du fichier, c''est-à-dire sur une autre question '
      '(constat A-6). « CV_Jean_DUPONT.pdf » est conservé mot pour mot (normaliserNomFichier '
      'ne retire que les composants de chemin et les caractères de commande) et renvoyé dans '
      'l''en-tête content-disposition. SIGNALÉ et non anonymisé : renommer une pièce jointe '
      'romprait le lien avec ce que l''utilisateur a déposé, et un nom de fichier est '
      'souvent la seule façon de la retrouver. ⚠️ La description voisine porte le même '
      'régime ; l''incohérence était interne à une seule table.'
 where (table_nom, colonne) in (('pieces_jointes', 'nom_fichier'), ('imports', 'nom_fichier'));

update colonnes_personnelles set
    nature = 'personnelle',
    finalite = 'Dire ce qui a été audité',
    base_legale = 'Intérêt légitime',
    duree_jours = 1095,
    a_expiration = 'signaler',
    justification =
      '⚠️ SAISIE LIBRE, et la rédaction précédente affirmait le contraire — « aucune saisie '
      'libre » sur une colonne « text » nue, sans contrainte ni domaine (constat A-5). Un '
      'périmètre d''audit se tape à la main (« site de Toulouse, équipe de M. Dupont »), et '
      'la prose voisine audits.synthese porte déjà le régime « signaler ». Même régime, même '
      'motif : effacer le périmètre d''un audit rendrait le rapport inexploitable.'
 where (table_nom, colonne) = ('audits', 'perimetre');

update colonnes_personnelles set
    a_expiration = 'signaler',
    justification =
      'SAISIE LIBRE dont le sujet est le motif d''activation d''un référentiel, pas une '
      'personne — mais un nom peut y figurer au milieu d''une phrase (« activé à la demande '
      'de M. Dupont »). ⚠️ La rédaction précédente affirmait « aucune saisie libre » sur une '
      'colonne « text » nue, sans contrainte ni domaine (constat A-5). Même régime que '
      'filiales.notes.'
 where (table_nom, colonne) = ('referentiels_actifs', 'motif');

update colonnes_personnelles set
    a_expiration = 'signaler',
    justification =
      'SAISIE LIBRE de l''article 30 : la mention des transferts hors Union nomme souvent le '
      'sous-traitant et son contact. ⚠️ La rédaction précédente affirmait « vocabulaire '
      'clos » sur une colonne « text » nue (constat A-5), quand traitements.destinataires — '
      'même table, même nature de contenu — est déclarée « personnelle · signaler ».'
 where (table_nom, colonne) = ('traitements', 'transfert_hors_ue');

-- ── LES QUINZE AUTRES : la justification cesse d'affirmer une borne qui n'existe pas ──
--
-- Elles restent `non_personnelle`, et c'est juste — un type MIME, un numéro de version, le
-- nom d'une colonne rejetée à l'import ne sont pas des personnes. Ce qui change est la
-- PHRASE : elle ne dit plus « aucune saisie libre » là où rien ne le garantit.

update colonnes_personnelles set
    justification = replace(justification,
        'Aucune saisie libre, aucune personne.',
        '⚠️ Aucune CONTRAINTE ne borne cette colonne : la valeur est technique par usage, '
        'non par construction (constat A-5). Ce qui la rend non personnelle est son SUJET, '
        'et un usage qui y écrirait autre chose rendrait cette décision fausse — c''est une '
        'limite du registre, et elle est dite.')
 where nature = 'non_personnelle'
   and justification like 'Vocabulaire clos%'
   and exists (select 1 from f_colonnes_textuelles() t
                where t.table_nom = colonnes_personnelles.table_nom
                  and t.colonne = colonnes_personnelles.colonne)
   -- …et aucune contrainte « check » ne cite cette colonne, ni de domaine.
   and not exists (
         select 1 from pg_constraint k
           join pg_class c on c.oid = k.conrelid
          where c.relname = colonnes_personnelles.table_nom
            and k.contype = 'c'
            and pg_get_expr(k.conbin, k.conrelid) like '%' || colonnes_personnelles.colonne || '%');

-- ── LE GARDE : une déclaration ne promet plus une borne qu'elle n'a pas ──────────────
create or replace function f_verifier_justifications_bornees()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare r record;
begin
    for r in
        select p.table_nom, p.colonne
          from colonnes_personnelles p
         where p.justification like '%Aucune saisie libre%'
           and exists (select 1 from f_colonnes_textuelles() t
                        where t.table_nom = p.table_nom and t.colonne = p.colonne)
           and not exists (
                 select 1 from pg_constraint k
                   join pg_class c on c.oid = k.conrelid
                   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
                  where c.relname = p.table_nom and k.contype = 'c'
                    and pg_get_expr(k.conbin, k.conrelid) like '%' || p.colonne || '%')
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'justification_promet_une_borne_absente';
        detail   := 'La justification de cette déclaration affirme « aucune saisie libre », '
                    'et AUCUNE contrainte ni domaine ne borne la colonne. C''est la classe '
                    'du constat Q-291 — affirmer une propriété au lieu de la poser —, '
                    'appliquée au registre qu''on présente à un DPO. Posez la contrainte, ou '
                    'dites la limite (constat A-5).';
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_justifications_bornees() is
    'Une déclaration du registre qui affirme « aucune saisie libre » porte sur une colonne '
    'réellement BORNÉE — par une contrainte ou un domaine. Posé au constat A-5 : dix-huit '
    'des quatre-vingt-deux justifications « vocabulaire clos » portaient sur une colonne '
    '« text » nue, et trois d''entre elles désignaient de la prose où un nom figure.';

grant execute on function f_verifier_justifications_bornees() to grc_app;

-- =====================================================================================
-- §9 — A-12 : LE DÉFAUT « interne » DE `documents.confidentialite` EST GARDÉ
-- =====================================================================================
--
-- *« Le défaut est « interne » et NON « public » : un document dont personne n'a tranché la
-- diffusion ne doit pas être réputé diffusable »* — la migration `027` l'écrit, le guide
-- l'explique à l'exploitant, et **rien ne le tenait** : retirer le `default` laissait
-- `f_verifier_schema()` à zéro anomalie. Le retrait ne casse pas le produit (la SPA envoie
-- toujours le champ) : il change ce que devient un document repris d'un **export antérieur
-- à `027`**, ou créé par `psql`. C'est le réglage le plus discret du lot, et le pire s'il
-- bascule.

create or replace function f_verifier_defauts_de_classification()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare v_defaut text;
begin
    select pg_get_expr(d.adbin, d.adrelid) into v_defaut
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = to_regclass('public.documents') and a.attname = 'confidentialite';

    if v_defaut is null or v_defaut not like '%''interne''%' then
        objet    := 'documents.confidentialite';
        anomalie := 'defaut_de_diffusion_perdu';
        detail   := format(
            'Le défaut de « confidentialite » n''est plus « interne » (lu : %s). Un document '
            'repris d''un export antérieur à la migration 027, ou créé sans nommer la '
            'colonne, serait alors réputé PUBLIC — ou refusé. Le défaut est le réglage le '
            'plus discret de la classification, et le pire s''il bascule : un document dont '
            'personne n''a tranché la diffusion ne doit pas être réputé diffusable '
            '(constat A-12).', coalesce(v_defaut, '(aucun)'));
        return next;
    end if;
    return;
end;
$$;

comment on function f_verifier_defauts_de_classification() is
    'Le défaut de documents.confidentialite est « interne », jamais « public ». Posé au '
    'constat A-12 : la migration 027 l''écrit, le guide l''explique, et rien ne le tenait — '
    'le retirer laissait f_verifier_schema() à zéro anomalie.';

grant execute on function f_verifier_defauts_de_classification() to grc_app;

-- =====================================================================================
-- §10 — A-8 (a) : LE GARDE GÉNÉRIQUE EXIGE AUSSI QUE LA CONTRAINTE SOIT *VALIDÉE*
-- =====================================================================================
--
-- Une contrainte reposée `not valid` conserve son prédicat : `f_contrainte_accepte()` la
-- juge donc CORRECTEMENT, et pourtant **les lignes déjà en base n'ont jamais été
-- vérifiées**. `f_verifier_vocabulaire_journal()` regardait `convalidated` ;
-- `f_verifier_contraintes_eprouvees()`, qui a vocation à couvrir la classe, ne le regardait
-- pas — *la propriété a été perdue en généralisant*.
--
-- ⚠️ Le corps vient de `pg_get_functiondef()` : seuls la table des témoins (deux lignes de
-- plus pour la barrière de portée) et le contrôle de validité sont neufs.


-- ── LA TABLE DES TÉMOINS, EXTRAITE POUR N'AVOIR QU'UNE RÉDACTION ─────────────────────
--
-- Elle vivait dans le corps de `f_verifier_contraintes_eprouvees()` (migration `028`).
-- Remplacer cette fonction ici obligeait soit à la recopier — deux rédactions qui se
-- ressemblent le premier jour et divergent le second, le motif que ce chantier traque —,
-- soit à l'extraire. Elle est extraite.

create or replace function f_temoins_de_contraintes()
returns jsonb
    language sql immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select jsonb_build_array(
        -- ── ck_documents_confidentialite (027) — Q-292, mesuré tombé ────────────────
        jsonb_build_object('t','documents','c','ck_documents_confidentialite',
            'v', jsonb_build_object('confidentialite','diffusion libre'),
            'attendu', false,
            'motif','un niveau de diffusion inventé doit être REFUSÉ : sans cela « diffusion '
                    'libre » devient une valeur comme une autre, à une faute de frappe près, '
                    'et le filtrage par niveau perd des documents en silence'),
        jsonb_build_object('t','documents','c','ck_documents_confidentialite',
            'v', jsonb_build_object('confidentialite','public'),   'attendu', true,
            'motif','le niveau « public » doit rester écrivable'),
        jsonb_build_object('t','documents','c','ck_documents_confidentialite',
            'v', jsonb_build_object('confidentialite','interne'),  'attendu', true,
            'motif','le niveau « interne » est le défaut : le refuser rendrait tout document '
                    'inécrivable'),
        jsonb_build_object('t','documents','c','ck_documents_confidentialite',
            'v', jsonb_build_object('confidentialite','confidentiel'), 'attendu', true,
            'motif','le niveau « confidentiel » doit rester écrivable'),
        jsonb_build_object('t','documents','c','ck_documents_confidentialite',
            'v', jsonb_build_object('confidentialite','restreint'), 'attendu', true,
            'motif','le niveau « restreint » doit rester écrivable'),
        -- ── ck_pieces_jointes_en_vigueur_integre (025) — Q-292, mesuré tombé ────────
        jsonb_build_object('t','pieces_jointes','c','ck_pieces_jointes_en_vigueur_integre',
            'v', jsonb_build_object('en_vigueur', true, 'etat_integrite','ecart'),
            'attendu', false,
            'motif','une pièce dont le rapprochement d''intégrité a rendu « ecart » ne doit '
                    'PAS pouvoir porter « en vigueur ». « En vigueur » veut dire « celle-ci '
                    'fait référence », dans un outil produit en audit (constat Q-285)'),
        jsonb_build_object('t','pieces_jointes','c','ck_pieces_jointes_en_vigueur_integre',
            'v', jsonb_build_object('en_vigueur', true, 'etat_integrite','conforme'),
            'attendu', true,
            'motif','une pièce conforme doit pouvoir faire foi : sinon la barrière empêche le '
                    'produit de fonctionner au lieu de le protéger'),
        jsonb_build_object('t','pieces_jointes','c','ck_pieces_jointes_en_vigueur_integre',
            'v', jsonb_build_object('en_vigueur', false, 'etat_integrite','ecart'),
            'attendu', true,
            'motif','un écart sur une pièce qui ne fait PAS foi est une alerte, pas une mise '
                    'sous scellés : la ligne doit rester écrivable'),
        -- ── ck_journal_audit_action (013, 020) — le vocabulaire du journal ──────────
        jsonb_build_object('t','journal_audit','c','ck_journal_audit_action',
            'v', jsonb_build_object('action','changement_perimetre'), 'attendu', true,
            'motif','c''est l''action que le sélecteur de filiale émet à chaque basculement : '
                    'sans elle, le changement de filiale échoue en 23514 AU CLIC'),
        jsonb_build_object('t','journal_audit','c','ck_journal_audit_action',
            'v', jsonb_build_object('action','verification_integrite'), 'attendu', true,
            'motif','c''est l''action qu''émet le rapprochement d''une pièce avec son '
                    'empreinte : sans elle, un ÉCART constaté ne laisse AUCUNE trace'),
        jsonb_build_object('t','journal_audit','c','ck_journal_audit_action',
            'v', jsonb_build_object('action','action_hors_vocabulaire_temoin'), 'attendu', false,
            'motif','le vocabulaire du journal est CLOS : une action inventée doit être '
                    'refusée, sinon « action » redevient du texte libre et le journal cesse '
                    'de répondre à « qui a fait quoi »'),
        -- ── ck_documents_statut (002, 019) — le premier cas de la barrière ─────────
        jsonb_build_object('t','documents','c','ck_documents_statut',
            'v', jsonb_build_object('statut','en validation'), 'attendu', true,
            'motif','« en validation » est le PREMIER cas du déclencheur de publication : '
                    'l''ôter laisse la barrière en place et la vide de son objet'),
        jsonb_build_object('t','documents','c','ck_documents_statut',
            'v', jsonb_build_object('statut','statut_hors_vocabulaire_temoin'), 'attendu', false,
            'motif','le vocabulaire des statuts est clos : un statut inventé contournerait le '
                    'circuit d''approbation en ne ressemblant à aucun de ses cas'),
        -- ── ck_document_etiquettes_valeur (027) — la donnée libre du lot ───────────
        jsonb_build_object('t','document_etiquettes','c','ck_document_etiquettes_valeur',
            'v', jsonb_build_object('etiquette','  deux  espaces'), 'attendu', false,
            'motif','une étiquette non normalisée doit être refusée : « RGPD » et « RGPD  » '
                    'deviendraient deux étiquettes, et le filtre perdrait des lignes'),
        jsonb_build_object('t','document_etiquettes','c','ck_document_etiquettes_valeur',
            'v', jsonb_build_object('etiquette','audit,2026'), 'attendu', false,
            'motif','la virgule est le séparateur de la saisie : l''admettre dans la valeur '
                    'ferait d''une étiquette deux, à la relecture'),
        jsonb_build_object('t','document_etiquettes','c','ck_document_etiquettes_valeur',
            'v', jsonb_build_object('etiquette','audit 2026'), 'attendu', true,
            'motif','une étiquette ordinaire doit passer : sinon la fonctionnalité est morte'),
        -- ── ck_colonnes_personnelles_* (026) — le registre de l''article 30 ────────
        jsonb_build_object('t','colonnes_personnelles','c','ck_colonnes_personnelles_expiration',
            'v', jsonb_build_object('a_expiration','signaler'), 'attendu', true,
            'motif','« signaler » est le quatrième régime, trouvé par un essai : le perdre '
                    'rendrait « crise.notes » indéclarable'),
        jsonb_build_object('t','colonnes_personnelles','c','ck_colonnes_personnelles_expiration',
            'v', jsonb_build_object('a_expiration','regime_hors_vocabulaire_temoin'),
            'attendu', false,
            'motif','un régime inventé doit être refusé : la purge ne saurait pas quoi en '
                    'faire et laisserait la donnée en place en annonçant « terminé »'),
        jsonb_build_object('t','colonnes_personnelles','c','ck_colonnes_personnelles_regime',
            'v', jsonb_build_object('nature','personnelle'), 'attendu', false,
            'motif','une donnée déclarée « personnelle » SANS finalité, base légale, durée ni '
                    'régime n''est pas déclarée, elle est mentionnée : l''article 30 exige les '
                    'quatre, et sans eux le registre donne l''illusion de la conformité')
    );
$$;

comment on function f_temoins_de_contraintes() is
    'Les lignes témoins que f_verifier_contraintes_eprouvees() soumet aux contraintes qui '
    'portent une barrière : chacune dit ce que la base doit en faire, et POURQUOI. Extraite '
    'du corps de la fonction à la migration 031, pour n''en avoir qu''une rédaction.';

grant execute on function f_temoins_de_contraintes() to grc_app;

create or replace function f_verifier_contraintes_eprouvees()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_temoins  jsonb;
    v_temoin   jsonb;
    v_accepte  boolean;
    v_tables   text[];
    v_nom      text;
    r          record;
begin
    -- On reprend la table de témoins de la migration 028, telle quelle : elle vit là-bas,
    -- et la recopier ici en ferait deux rédactions.
    select f_temoins_de_contraintes() into v_temoins;

    for v_temoin in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte(
            v_temoin ->> 't', v_temoin ->> 'c', v_temoin -> 'v');

        if v_accepte is null then
            objet    := (v_temoin ->> 't') || '.' || (v_temoin ->> 'c');
            anomalie := 'contrainte_non_eprouvable';
            detail   := format(
                'La contrainte est introuvable, son prédicat n''a pas pu être évalué sur la '
                'ligne témoin %s, ou il RÉFÉRENCE UNE FONCTION NON NATIVE — auquel cas on '
                'refuse de l''exécuter (constat A-4 : « stable » ne bloque que l''écriture '
                'directe, et cette évaluation se fait sous l''identité du propriétaire). '
                '⚠️ « Je n''ai pas pu mesurer » ne vaut pas « c''est bon ». Motif du témoin : %s.',
                v_temoin ->> 'v', v_temoin ->> 'motif');
            return next;
            continue;
        end if;

        if v_accepte <> (v_temoin ->> 'attendu')::boolean then
            objet    := (v_temoin ->> 't') || '.' || (v_temoin ->> 'c');
            anomalie := case when (v_temoin ->> 'attendu')::boolean
                             then 'contrainte_refuse_une_valeur_legitime'
                             else 'contrainte_laisse_passer_l_interdit' end;
            detail   := format(
                'Ligne témoin %s : la contrainte %s, on attendait l''inverse. %s '
                '⚠️ Ce garde n''a PAS lu le texte de la contrainte — il a évalué son prédicat '
                'réel. Une contrainte vidée de sa substance qui garde son nom et ses mots '
                'est donc visible ici, et elle ne l''était nulle part ailleurs (constat '
                'Q-292, qui est Q-281 rouvert par les gardes écrits pour le fermer).',
                v_temoin ->> 'v',
                case when v_accepte then 'ACCEPTE cette ligne' else 'la REFUSE' end,
                v_temoin ->> 'motif');
            return next;
        end if;
    end loop;

    /* ── « ÉPROUVÉE » N'EST PAS « VALIDÉE » — constat A-8 ────────────────────────────
       Une contrainte reposée `not valid` garde son prédicat : les témoins ci-dessus la
       jugent juste, et les lignes DÉJÀ EN BASE n'ont jamais été vérifiées. */
    select array_agg(distinct v ->> 'c') into v_tables
      from jsonb_array_elements(v_temoins) v;
    foreach v_nom in array v_tables loop
        for r in
            select k.conname::text as nom, c.relname::text as tbl
              from pg_constraint k
              join pg_class c on c.oid = k.conrelid
              join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
             where k.conname = v_nom and k.contype = 'c' and not k.convalidated
        loop
            objet    := r.tbl || '.' || r.nom;
            anomalie := 'contrainte_non_validee';
            detail   := 'Cette contrainte porte une barrière et elle est déclarée « not '
                        'valid » : son prédicat est juste — les témoins le disent — mais '
                        'les lignes DÉJÀ EN BASE n''ont jamais été vérifiées. Validez-la '
                        '(« alter table … validate constraint … », dans une migration dont '
                        'le §0 pose le périmètre du groupe entier), ou dites au registre '
                        'pourquoi elle ne peut pas l''être (constat A-8).';
            return next;
        end loop;
    end loop;
    return;
end;
$$;

comment on function f_verifier_contraintes_eprouvees() is
    'ÉPROUVE les contraintes qui portent une barrière : chaque témoin est une ligne dont on '
    'sait ce que la base doit en faire, et le prédicat RÉEL est évalué dessus. ⚠️ Il exige '
    'aussi qu''elles soient VALIDÉES : une contrainte « not valid » garde son prédicat, donc '
    'les témoins la jugent juste, et les lignes déjà en base n''ont jamais été vérifiées — '
    'propriété perdue en généralisant depuis f_verifier_vocabulaire_journal() (constat A-8).';

-- =====================================================================================
-- §11 — CONSIGNATION ET VÉRIFICATION
-- =====================================================================================

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s / %s : %s', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 031 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie.';
end;
$$;

insert into migrations_schema (version, nom)
values ('031', 'les gardes regardent ce qui est RÉFÉRENCÉ et non le nom local ; '
               'f_domaine_accepte() rend son verdict et quelqu''un l''appelle ; un garde '
               'n''évalue pas un prédicat qui peut agir ; le registre franchit la frontière '
               'du texte (constats A-1 à A-9 et A-12 du 9ᵉ passage de la porte S8)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_barriere_traitement();
--   drop function if exists f_verifier_domaines_eprouves();
--   drop function if exists f_verifier_types_ranges();
--   drop function if exists f_verifier_justifications_bornees();
--   drop function if exists f_verifier_defauts_de_classification();
--   drop function if exists f_colonnes_candidates();
--   drop function if exists f_paires_de_portee();
--   delete from controles_schema where fonction in
--       ('f_verifier_barriere_traitement', 'f_verifier_domaines_eprouves',
--        'f_verifier_types_ranges', 'f_verifier_justifications_bornees',
--        'f_verifier_defauts_de_classification');
--   delete from migrations_schema where version = '031';
--   commit;
--   -- ⚠️ Les fonctions REMPLACÉES ne se rétablissent pas par un « drop » : il faut rejouer
--   --    028 §2/§3, 029 §3 et 030 §1. Et la VALIDATION de
--   --    ck_pieces_jointes_en_vigueur_integre ne s'annule pas : une contrainte validée ne
--   --    se dévalide pas, et rien ne l'exige.
-- =====================================================================================
