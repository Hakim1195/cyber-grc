-- =====================================================================================
--  030 — LA CLÉ DE PORTÉE OUVRE LE SENS QUI EST SANS DANGER
--
--  §0  Le périmètre de la migration
--  §1  Un document LOCAL peut relever d'un traitement de GROUPE                — Q-294
--  §2  La normalisation des étiquettes est armée aussi à la MODIFICATION       — Q-298
--  §3  Consignation
--
-- =====================================================================================
--  §1 — POURQUOI, ET L'ARBITRAGE QUI EST DERRIÈRE
--
--  La migration `027` a posé deux clés composites entre `documents` et `traitements`,
--  exigeant **les deux extrémités du même côté de la frontière**. L'exigence est
--  SYMÉTRIQUE ; le danger, lui, ne l'est pas.
--
--   · **document GROUPE → traitement LOCAL** — c'est le danger, et c'est le constat
--     **N-10** de la porte S1 : la politique que les vingt filiales lisent désignerait
--     une ligne qu'UNE filiale peut effacer. Ce sens reste **fermé**.
--   · **document LOCAL → traitement GROUPE** — c'est le cas le plus FRÉQUENT, et il est
--     **sans danger** : un traitement de portée Groupe n'est effaçable que par
--     l'administration Groupe, jamais par la filiale qui le désigne. La `027` le nomme
--     elle-même (« l'annuaire commun, le journal d'audit de cet outil »), puis l'interdit.
--
--  Mesuré par l'auditeur du 8ᵉ passage de la porte S8, par la route réelle :
--
--      traitements servis au navigateur : TRT-A, TRT-G, TRT-GROUPE
--      création d'un document LOCAL rattaché au traitement GROUPE : **409**
--      « l'enregistrement … désigne un élément qui n'existe pas dans votre périmètre »
--
--  L'utilisateur choisit, dans une liste que le produit vient de lui servir, une valeur
--  que le produit refuse — et le message lui dit que l'élément **n'existe pas dans son
--  périmètre**, alors qu'il est affiché sous ses yeux. **Dix-neuf filiales ne pouvaient
--  rattacher aucune de leurs procédures au traitement que le Groupe opère pour elles.**
--
--  ⚠️ **C'est L'ARBITRAGE qui est corrigé, pas l'écran.** Filtrer la liste aurait rendu
--  le produit cohérent en lui retirant la moitié de ce que le lot promettait — « les deux
--  registres que le produit tenait sans se connaître sont reliés ici ».
--
--  ── COMMENT LA BASE LE TIENT, ET POURQUOI PAS UN SIMPLE `FOREIGN KEY` ────────────────
--
--  « Même filiale OU cible de portée Groupe » n'est pas une clé étrangère : ce n'est pas
--  une égalité, c'est une disjonction. Et une clé SIMPLE `traitement_id → traitements(id)`
--  est hors de question — `CONVENTIONS.md` §17.1 : *une clé simple est satisfaite par une
--  ligne INVISIBLE de la filiale voisine*, ce qui ferait de ce champ un oracle
--  d'existence inter-filiales.
--
--  La forme retenue **matérialise la filiale VISÉE** dans une colonne, et laisse ensuite
--  les clés étrangères faire leur travail sans disjonction :
--
--      traitement_filiale_id     posée PAR UN DÉCLENCHEUR depuis le traitement désigné
--      traitement_portee_groupe  engendrée : (traitement_filiale_id is null)
--
--      fk … (traitement_id, traitement_filiale_id)    -> traitements (id, filiale_id)
--      fk … (traitement_id, traitement_portee_groupe) -> traitements (id, portee_groupe)
--      check  filiale_id is not null or traitement_filiale_id is null   ← N-10 fermé
--      check  traitement_filiale_id is null or traitement_filiale_id = filiale_id
--
--  Ce que chacune tient, et il faut les quatre :
--
--   · un document de portée GROUPE ne peut viser qu'un traitement de portée Groupe (le
--     premier `check`, puis la clé de portée) — **le constat N-10 reste fermé** ;
--   · un document LOCAL visant un traitement LOCAL doit viser celui de SA filiale (le
--     second `check`, puis la clé de cohérence) — le cloisonnement tient ;
--   · un document LOCAL visant un traitement de portée Groupe passe par la clé de portée,
--     qui exige `portee_groupe = true` chez la cible — c'est le sens qu'on ouvre ;
--   · la suppression du traitement visé reste `restrict` dans les deux cas.
--
--  ⚠️ **Le déclencheur POSE la colonne, il ne la croit pas.** Une valeur envoyée par le
--  client est écrasée : c'est le principe du périmètre qui vient du serveur
--  (`PLAN_SERVEUR` §2.4), appliqué à une colonne dérivée d'une autre ligne. Et il est armé
--  `always` — sans quoi `set session_replication_role = replica` le neutraliserait, et la
--  colonne mentirait au lieu d'être absente (leçon des constats Q-281 et Q-292).
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §1 ajoute des contraintes sur `documents` et le §2 sur `document_etiquettes` :
-- `add constraint` VALIDE les lignes existantes, donc il BALAIE des tables cloisonnées, et
-- `force row level security` vaut aussi pour le propriétaire. Sans réglage, la migration
-- échouerait en GRC04 sans nommer sa cause. On déclare le groupe ENTIER — un périmètre
-- partiel validerait sur les seules lignes visibles, en silence (motif du §0 de la `012`).

do $$
begin
    perform set_config('grc.utilisateur', 'migration-030', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — Q-294 : UN DOCUMENT LOCAL PEUT RELEVER D'UN TRAITEMENT DE GROUPE
-- =====================================================================================

alter table documents
    drop constraint if exists fk_documents_traitement_portee,
    drop constraint if exists fk_documents_traitement_coherence;

alter table documents
    add column if not exists traitement_filiale_id id_metier,
    add column if not exists traitement_portee_groupe boolean
        generated always as (traitement_filiale_id is null) stored;

comment on column documents.traitement_filiale_id is
    'La filiale du traitement VISÉ — nulle quand ce traitement est de portée Groupe. ⚠️ Elle '
    'est POSÉE PAR LE DÉCLENCHEUR trg_documents_traitement_portee, jamais par le client : '
    'c''est une valeur dérivée d''une AUTRE ligne, et la croire sur parole rouvrirait un '
    'oracle d''existence inter-filiales. Elle existe parce que « même filiale OU cible de '
    'portée Groupe » est une disjonction, et qu''une disjonction n''est pas une clé '
    'étrangère (constat Q-294).';

create or replace function f_documents_traitement_portee() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_filiale_cible id_metier;
    v_trouve        boolean;
begin
    if new.traitement_id is null then
        new.traitement_filiale_id := null;
        return new;
    end if;

    -- ⚠️ La lecture passe par la RLS : un traitement invisible depuis le périmètre de
    -- l'appelant n'est pas trouvé, et le refus ci-dessous ne distingue pas « il n'existe
    -- pas » de « il ne vous est pas visible ». C'est voulu — la distinction serait
    -- l'oracle d'existence que le produit ferme depuis la porte S2.
    select t.filiale_id, true into v_filiale_cible, v_trouve
      from traitements t where t.id = new.traitement_id;

    if not coalesce(v_trouve, false) then
        raise exception 'Le traitement « % » n''existe pas dans votre périmètre.',
                        new.traitement_id
            using errcode = 'GRC07',
                  hint    = 'Choisissez un traitement de votre filiale, ou un traitement de '
                            'portée Groupe.';
    end if;

    new.traitement_filiale_id := v_filiale_cible;
    return new;
end;
$$;

comment on function f_documents_traitement_portee() is
    'Pose documents.traitement_filiale_id depuis le traitement désigné, pour que les deux '
    'clés étrangères puissent tenir une règle qui est une DISJONCTION — « même filiale OU '
    'cible de portée Groupe » (constat Q-294). Il ÉCRASE ce que le client aurait envoyé : '
    'le périmètre vient du serveur, et cela vaut aussi pour une valeur dérivée d''une autre '
    'ligne.';

drop trigger if exists trg_documents_traitement_portee on documents;
create trigger trg_documents_traitement_portee
    before insert or update of traitement_id on documents
    for each row execute function f_documents_traitement_portee();
alter table documents enable always trigger trg_documents_traitement_portee;

-- Les lignes déjà en base : la colonne est neuve, donc nulle. On la pose avant d'ajouter
-- les contraintes, sans quoi tout document déjà rattaché à un traitement LOCAL serait
-- refusé à la validation.
update documents d
   set traitement_filiale_id = t.filiale_id
  from traitements t
 where d.traitement_id = t.id and d.traitement_id is not null;

alter table documents
    add constraint fk_documents_traitement_coherence
    foreign key (traitement_id, traitement_filiale_id)
    references traitements (id, filiale_id) on delete restrict;

alter table documents
    add constraint fk_documents_traitement_portee
    foreign key (traitement_id, traitement_portee_groupe)
    references traitements (id, portee_groupe) on delete restrict;

-- ── LE SENS QUI RESTE FERMÉ, ET C'EST LE CONSTAT N-10 ────────────────────────────────
alter table documents
    add constraint ck_documents_traitement_groupe
    check (filiale_id is not null or traitement_filiale_id is null);

comment on constraint ck_documents_traitement_groupe on documents is
    'Un document de portée GROUPE ne peut relever que d''un traitement de portée Groupe. '
    'C''est le constat N-10 de la porte S1 : la politique que les vingt filiales lisent ne '
    'doit pas désigner une ligne qu''UNE filiale peut effacer. ⚠️ Le sens INVERSE — un '
    'document local relevant d''un traitement de Groupe — est OUVERT depuis la migration '
    '030 : il est sans danger, un traitement de portée Groupe n''étant effaçable que par '
    'l''administration Groupe (constat Q-294).';

alter table documents
    add constraint ck_documents_traitement_filiale
    check (traitement_filiale_id is null or traitement_filiale_id = filiale_id);

comment on constraint ck_documents_traitement_filiale on documents is
    'Un document local qui vise un traitement LOCAL vise celui de SA filiale. Sans cette '
    'contrainte, poser « traitement_filiale_id » à la filiale voisine satisferait la clé de '
    'cohérence et créerait un lien inter-filiales.';

-- =====================================================================================
-- §2 — Q-298 : LA NORMALISATION DES ÉTIQUETTES EST ARMÉE AUSSI À LA MODIFICATION
-- =====================================================================================
--
-- `trg_document_etiquettes_normalise` était `before insert` **seul**, et le garde-fou
-- vérifiait exactement `(tgtype & 4) = 4` — c'est-à-dire qu'il **mesurait précisément le
-- chemin couvert, et pas celui qui ne l'était pas**. Mesuré par l'auditeur :
--
--     insérer la variante de casse   → REFUS (« … déjà l'étiquette « rgpd », à la casse près »)
--     MODIFIER une étiquette vers la variante de casse :
--        document_id | etiquette
--        DOC-E1      | RGPD
--        DOC-E1      | rgpd        ← les deux coexistent
--
-- « Un filtre qui perd des lignes en silence est pire que pas de filtre » — le commentaire
-- de la `027`, pris en défaut par le chemin qu'il n'avait pas armé.
--
-- ⚠️ **DEUX REMÈDES, ET ILS NE FONT PAS DOUBLE EMPLOI.**
--
--  · le déclencheur est élargi à `before insert or update of etiquette` : il garde la
--    normalisation des espaces et le message qui NOMME l'étiquette en cause ;
--  · un **index unique sur `(document_id, lower(etiquette))`** tient la propriété par la
--    FORME plutôt que par une procédure. C'est lui qui survit à un déclencheur désarmé,
--    à une migration, à `psql` — *une route ne voit que son chemin, il y en a toujours un
--    de plus*. Le déclencheur donne le bon message ; l'index donne la garantie.
--
-- ⚠️ **L'ordre compte** : le déclencheur normalise AVANT que l'index juge, puisqu'il est
-- `before`. Sans cela, « RGPD  » et « RGPD » passeraient l'index et seraient deux lignes.

-- ⚠️ **`filiale_id` EST DANS LA CLÉ, et le garde-fou l'a exigé** — `CONVENTIONS.md` §19.1,
-- posé à la porte S1 : *une unicité sans `filiale_id` laisse une filiale occuper une valeur
-- dans l'espace d'une autre, qui reçoit un doublon sans détail sur une ligne invisible.*
-- Ce n'est pas une formalité ici : `f_verifier_unicite_cloisonnee()` a refusé la migration
-- tant que la colonne n'y était pas.
--
-- ⚠️ **`nulls not distinct`, et sans cela l'index ne servirait à rien pour le socle
-- Groupe** : `filiale_id` est NUL pour un document de portée Groupe, et PostgreSQL tient
-- par défaut deux NUL pour distincts — deux étiquettes « RGPD » et « rgpd » sur la même
-- PSSI de Groupe auraient donc passé l'index, c'est-à-dire exactement le cas que cet index
-- existe pour fermer.
create unique index if not exists uq_document_etiquettes_casse
    on document_etiquettes (filiale_id, document_id, lower(etiquette)) nulls not distinct;

comment on index uq_document_etiquettes_casse is
    'Unicité de l''étiquette par document, SANS ÉGARD À LA CASSE — constat Q-298. Elle tient '
    'la propriété par la FORME, là où le déclencheur la tenait par une procédure armée sur '
    'le seul « insert » : un « update » vers la variante de casse passait, et « RGPD » et '
    '« rgpd » coexistaient sur la même fiche.';

drop trigger if exists trg_document_etiquettes_normalise on document_etiquettes;
create trigger trg_document_etiquettes_normalise
    before insert or update of etiquette on document_etiquettes
    for each row execute function f_normaliser_etiquette();
alter table document_etiquettes enable always trigger trg_document_etiquettes_normalise;

-- ── LE GARDE MESURE LES DEUX ÉVÉNEMENTS ──────────────────────────────────────────────
--
-- ⚠️ **Le corps vient de `pg_get_functiondef()`**, et la seule différence est le §3 —
-- `(tgtype & 16) = 16` en plus, et l'index exigé. Le reste est reconduit à l'identique :
-- *on ne remplace pas une fonction dont on n'a lu qu'une partie.*

create or replace function f_verifier_classification_documents()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_niveaux constant text[] := array['public', 'interne', 'confidentiel', 'restreint'];
    v_source  text;
    v_niveau  text;
    r         record;
begin
    -- 1. Les deux colonnes existent, portent LE TYPE ATTENDU, et sont NOT NULL.
    --    « Non classifié » est le trou que ce lot ferme ; une colonne nullable le
    --    rouvrirait sans un mot. Et le TYPE est vérifié parce qu'il porte du sens :
    --    `donnees_personnelles` ramenée à du texte accepterait « non », « Non », « n »
    --    et « faux » comme autant de vérités distinctes — c'est le §5 des conventions,
    --    et c'est un défaut que ce produit a déjà connu.
    for r in
        select * from (values ('confidentialite', 'text'),
                              ('donnees_personnelles', 'boolean')) as v(nom, typ)
    loop
        if not exists (
            select 1 from pg_attribute a
             where a.attrelid = to_regclass('public.documents')
               and a.attname = r.nom and a.attnum > 0 and not a.attisdropped
               and a.attnotnull
               and format_type(a.atttypid, a.atttypmod) = r.typ)
        then
            objet    := 'documents.' || r.nom;
            anomalie := 'classification_absente_ou_facultative';
            detail   := format(
                'La colonne de classification manque, elle accepte le nul, ou elle n''est '
                'plus de type « %s » : un document sans niveau de diffusion déclaré est '
                'exactement ce que l''ISO 27001 A.5.12 et le RGPD demandent de fermer.',
                r.typ);
            return next;
        end if;
    end loop;

    -- 2. La contrainte de niveaux existe ET elle porte LES QUATRE. Un contrôle qui se
    --    contente du nom laisserait passer « check (confidentialite in ('public')) ».
    --    ⚠️ Ce contrôle-ci compare du TEXTE, et il ne suffit pas : une contrainte vidée
    --    de sa substance le satisfait (constat Q-292). C'est
    --    `f_verifier_contraintes_eprouvees()` (migration 028) qui ÉVALUE le prédicat sur
    --    des lignes témoins ; les deux se complètent, et celui-ci nomme précisément
    --    QUEL niveau a disparu.
    select pg_get_constraintdef(con.oid) into v_source
      from pg_constraint con
     where con.conrelid = to_regclass('public.documents')
       and con.conname = 'ck_documents_confidentialite';

    if v_source is null then
        objet    := 'documents.ck_documents_confidentialite';
        anomalie := 'niveaux_non_bornes';
        detail   := 'Aucune contrainte ne borne les niveaux de confidentialité : « diffusion '
                    'libre » deviendrait une valeur comme une autre, à une faute de frappe '
                    'près, et le filtrage par niveau perdrait des documents en silence.';
        return next;
    else
        foreach v_niveau in array v_niveaux loop
            if position('''' || v_niveau || '''' in v_source) = 0 then
                objet    := 'documents.ck_documents_confidentialite';
                anomalie := 'niveau_de_diffusion_perdu';
                detail   := format('Le niveau « %s » ne figure plus dans la contrainte : '
                                   '%s. Les quatre niveaux sont le vocabulaire de la '
                                   'classification, et en retirer un rend inécrivables les '
                                   'documents qui le portaient.', v_niveau, v_source);
                return next;
            end if;
        end loop;
    end if;

    -- 3. La normalisation des étiquettes est un DÉCLENCHEUR ARMÉ SUR L'INSERTION **ET SUR
    --    LA MODIFICATION**, pas une fonction que quelqu'un se souviendra d'appeler. Mesure
    --    de l'ÉVÉNEMENT — constat Q-281.
    --      tgtype : 1 = ROW, 2 = BEFORE, 4 = INSERT, 16 = UPDATE.
    --
    --    ⚠️ **`& 16` est le constat Q-298**, et la façon dont il est né mérite d'être lue :
    --    ce contrôle vérifiait `& 4` et rien d'autre, c'est-à-dire qu'il **mesurait
    --    exactement le chemin couvert et pas celui qui ne l'était pas**. Le déclencheur
    --    était `before insert` seul, un `update` vers la variante de casse passait, et le
    --    garde **consacrait le trou** en le décrivant comme la propriété attendue. C'est la
    --    cinquième occurrence du motif « un essai — ici un garde — qui mesure un défaut et
    --    le consacre comme une propriété désirable » (motif Q-200).
    if not exists (
        select 1 from pg_trigger t
         where t.tgrelid = to_regclass('public.document_etiquettes')
           and not t.tgisinternal
           and t.tgname = 'trg_document_etiquettes_normalise'
           and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2
           and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16
           and t.tgenabled = 'A')
    then
        objet    := 'document_etiquettes.trg_document_etiquettes_normalise';
        anomalie := 'normalisation_non_armee';
        detail   := 'Le déclencheur de normalisation des étiquettes manque, ne répond pas à '
                    '« before insert OR UPDATE … for each row », ou n''est pas armé '
                    '« always » (il serait alors muet pour le propriétaire des tables, donc '
                    'pour toute migration et toute reprise). « RGPD » et « rgpd » '
                    'deviendraient deux étiquettes, et le filtre par étiquette perdrait des '
                    'lignes sans le dire (constats Q-281 et Q-298).';
        return next;
    end if;

    -- 4. L'INDEX qui tient la propriété par la FORME — constat Q-298. Le déclencheur
    --    donne le bon message ; l'index donne la garantie, et il survit à un déclencheur
    --    désarmé, à une migration et à `psql`.
    if not exists (
        select 1 from pg_index i
          join pg_class ic on ic.oid = i.indexrelid
         where i.indrelid = to_regclass('public.document_etiquettes')
           and ic.relname = 'uq_document_etiquettes_casse'
           and i.indisunique
           and pg_get_indexdef(i.indexrelid) like '%lower(etiquette)%'
           and pg_get_indexdef(i.indexrelid) like '%NULLS NOT DISTINCT%')
    then
        objet    := 'document_etiquettes.uq_document_etiquettes_casse';
        anomalie := 'unicite_casse_absente';
        detail   := 'L''index unique sur (document_id, lower(etiquette)) manque, n''est plus '
                    'unique, ne porte plus sur « lower(etiquette) », ou a perdu son '
                    '« nulls not distinct » — sans lequel il ne dédoublonnerait RIEN sur le '
                    'socle Groupe, dont le filiale_id est nul. C''est lui qui tient '
                    'l''unicité insensible à la casse par la FORME : sans lui, la propriété '
                    'ne repose plus que sur un déclencheur, c''est-à-dire sur un chemin — et '
                    'il y en a toujours un de plus (constat Q-298).';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_classification_documents() is
    'La classification documentaire tient : les deux colonnes existent, portent leur TYPE et '
    'sont obligatoires ; la contrainte de niveaux nomme les quatre valeurs ; la normalisation '
    'des étiquettes est un déclencheur armé « always » sur l''INSERTION ET LA MODIFICATION '
    '(constat Q-298 — il ne l''était que sur l''insertion, et ce garde mesurait exactement le '
    'chemin couvert) ; et l''unicité insensible à la casse est tenue par un INDEX, c''est-à-dire '
    'par la forme et non par une procédure.';

-- =====================================================================================
-- §3 — CONSIGNATION ET VÉRIFICATION
-- =====================================================================================

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s / %s : %s', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 030 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie.';
end;
$$;

insert into migrations_schema (version, nom)
values ('030', 'un document local peut relever d''un traitement de Groupe, l''inverse reste '
               'fermé ; la normalisation des étiquettes est armée aussi à la modification, '
               'et l''unicité de casse tenue par un index (constats Q-294, Q-298)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop index if exists uq_document_etiquettes_casse;
--   alter table documents drop constraint if exists ck_documents_traitement_filiale,
--                         drop constraint if exists ck_documents_traitement_groupe,
--                         drop constraint if exists fk_documents_traitement_portee,
--                         drop constraint if exists fk_documents_traitement_coherence;
--   drop trigger if exists trg_documents_traitement_portee on documents;
--   drop function if exists f_documents_traitement_portee();
--   alter table documents drop column if exists traitement_portee_groupe,
--                         drop column if exists traitement_filiale_id;
--   delete from migrations_schema where version = '030';
--   commit;
--   -- ⚠️ Rétablir les clés de la 027 ROUVRIRAIT le constat Q-294 : dix-neuf filiales ne
--   --    pourraient plus rattacher leurs procédures au traitement que le Groupe opère.
-- =====================================================================================
