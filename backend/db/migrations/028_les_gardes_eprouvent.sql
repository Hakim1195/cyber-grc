-- =====================================================================================
--  028 — LES GARDE-FOUS ÉPROUVENT AU LIEU DE RECONNAÎTRE
--
--  §1  Le registre RGPD n'est plus réinscriptible, et la propriété est POSÉE  — Q-291
--  §2  Un garde-fou ÉVALUE le prédicat au lieu de lire son texte              — Q-292
--  §3  La compagne de portée doit protéger LA MÊME colonne                    — Q-297
--  §4  Le verrou d'approbation DÉCOUVRE ses colonnes                          — Q-299
--  §5  Le registre impose la cohérence de TYPE                                — Q-300
--  §6  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Le 8ᵉ passage de la porte S8 (11/09/2026) a rendu un chiffre : **sur 41 mutations,
--  14 ne mordent pas — et treize visent des gardes posés dans les trois jours
--  précédents.** Cinq constats — Q-291, Q-292, Q-295, Q-297, Q-299 — sont la même faute
--  prise sous cinq angles :
--
--      un garde-fou qui RECONNAÎT UN MOT au lieu de MESURER UN SENS,
--      ou une liste écrite à la main dont l'incomplétude RÉUSSIT EN SILENCE.
--
--  La mesure qui condamne, jouée par l'auditeur sur une base jetable :
--
--      alter table documents drop constraint ck_documents_confidentialite;
--      alter table documents add  constraint ck_documents_confidentialite
--        check (confidentialite in ('public','interne','confidentiel','restreint')
--               or confidentialite is not null);        -- ← vraie pour TOUT
--      select count(*) from f_verifier_schema();        -- → 0
--      update documents set confidentialite = 'diffusion libre';   -- → ACCEPTÉ
--
--  C'est le constat **Q-281 rouvert par les gardes écrits pour le fermer**, et le
--  commentaire de l'un d'eux cite Q-283 en promettant de mesurer le contenu.
--
--  ⚠️ **CE QUI CHANGE ICI N'EST PAS UNE SOUS-CHAÎNE DE PLUS.** Un garde qui compare du
--  texte est contournable par qui le lit ; c'est le seul cas qui compte pour une
--  barrière. On ne compare donc plus : **on envoie une valeur témoin et on constate le
--  refus.** Trois lignes d'`execute` disent ce que mille `position()` ne diront jamais.
--
--  ⚠️ **Pas de §0 de périmètre ici, et c'est mesuré, pas supposé.** Cette migration
--  n'ajoute AUCUNE contrainte de table : elle ne fait que `revoke`, `create or replace
--  function` et `comment`. Le §0 de la `012` existe parce qu'`add constraint` VALIDE les
--  lignes existantes, donc LIT des tables cloisonnées, et que `force row level security`
--  vaut aussi pour le propriétaire. Rien de tel ici.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — Q-291 : LE REGISTRE RGPD N'EST PLUS RÉINSCRIPTIBLE
-- =====================================================================================
--
-- La migration `026` écrit DEUX FOIS, en toutes lettres :
--
--   « Ce qui le protège est le PRIVILÈGE, pas le prédicat — seul le propriétaire y
--     écrit, au fil des migrations. »
--   « Son écriture est fermée par les PRIVILÈGES, pas par un prédicat : le rôle
--     applicatif n'a que « select » dessus. »
--
-- C'était **faux**. `001_socle.sql` §0 pose `alter default privileges … grant select,
-- insert, update, delete to grc_app` AVANT toute création de table : `colonnes_personnelles`,
-- créée en `026`, en a hérité les quatre. Mesuré sous `grc_app` :
--
--     delete from colonnes_personnelles;   -- aucun refus, 58 lignes parties
--     select count(*) from f_verifier_schema();  -- → 0 anomalie
--
-- Le rayon : tout ce qui obtient l'exécution de SQL par l'application peut **vider ou
-- falsifier le registre de l'article 30 du produit**, la purge cesse d'anonymiser la
-- colonne touchée, et le DPO lit un registre falsifié.
--
-- ⚠️ **LA LEÇON, ET ELLE VAUT AU-DELÀ DE CETTE TABLE :** *une migration a AFFIRMÉ une
-- propriété au lieu de la POSER, et rien ne comparait au catalogue.* Un commentaire n'est
-- pas une barrière. Le §2 ci-dessous en fait une règle mécanique.

revoke insert, update, delete, truncate on colonnes_personnelles from grc_app;
revoke insert, update, delete, truncate on colonnes_personnelles from grc_lecture;

-- ── LE GARDE QUI L'EMPÊCHE DE REVENIR, et il DÉCOUVRE ────────────────────────────────
--
-- `f_verifier_privileges()` §4 tient déjà cette propriété — mais sur une liste
-- `v_registres` écrite à la main, où `colonnes_personnelles` n'a jamais été inscrite.
-- **Son incomplétude réussissait en silence** : c'est la forme exacte que le
-- `CLAUDE.md` §3 range du mauvais côté.
--
-- Le garde ci-dessous renverse le sens. Il ne part pas d'une liste de registres : il
-- **découvre dans le catalogue** toute table dépourvue de `filiale_id` — c'est-à-dire
-- toute table dont quelqu'un a un jour décidé qu'elle n'appartenait à aucune filiale —
-- et il exige qu'elle soit rangée dans l'une des deux familles. Une table neuve qui
-- n'est dans aucune des deux **fait rougir**, et un humain doit trancher : est-ce un
-- registre que seul le déploiement écrit, ou une table que l'application écrit ?
--
-- ⚠️ **C'est le cas (a) du `CLAUDE.md` §3, et il est ici tenu** : la liste est écrite à
-- la main parce que la question appelle une DÉCISION, et son incomplétude **échoue
-- bruyamment** — non pas « parce qu'on l'a écrit », mais parce que le balayage part du
-- catalogue et non de la liste. C'est toute la différence avec Q-295.

create or replace function f_verifier_registres_techniques()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- (1) LES REGISTRES : écrits par le déploiement sous le compte propriétaire, jamais
    --     par un rôle de connexion. Un rôle qui pourrait les écrire pourrait effacer
    --     l'alarme avant de la déclencher.
    v_registres constant text[] := array[
        'migrations_schema',      -- empreinte des migrations appliquées (Q-5)
        'controles_schema',       -- dernière observation des garde-fous (Q-5)
        'colonnes_personnelles'   -- registre de l'article 30 DU PRODUIT (Q-291)
    ];
    -- (2) LES TABLES SANS FILIALE QUE L'APPLICATION ÉCRIT LÉGITIMEMENT. Elles sont de
    --     niveau Groupe, ou elles produisent le périmètre lui-même, ou ce sont des
    --     liaisons qui se cloisonnent par leur parent. Leur écriture est tenue par une
    --     politique RLS, pas par les privilèges.
    v_ecrites_par_l_application constant text[] := array[
        'filiales', 'utilisateurs', 'profils', 'profil_domaines',
        'sessions', 'session_domaines',
        'mappings', 'mapping_exigences',
        'actif_dependances', 'actif_risques', 'incident_actifs',
        'processus_actifs', 'risque_exigences', 'import_erreurs'
    ];
    r      record;
    v_nom  text;
begin
    /* ── SENS 1 : une table sans filiale_id que PERSONNE n'a rangée ──────────────── */
    for r in
        select c.relname::text as nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         where c.relkind = 'r'
           and not exists (select 1 from pg_attribute a
                            where a.attrelid = c.oid and a.attname = 'filiale_id'
                              and a.attnum > 0 and not a.attisdropped)
           and not (c.relname::text = any (v_registres))
           and not (c.relname::text = any (v_ecrites_par_l_application))
         order by 1
    loop
        objet    := r.nom;
        anomalie := 'table_sans_filiale_non_rangee';
        detail   := 'Cette table ne porte pas de « filiale_id », et rien ne dit QUI '
                    'l''écrit. Décidez dans f_verifier_registres_techniques() : « registre '
                    'technique » — écrit par le seul déploiement, et les rôles de connexion '
                    'n''y ont que « select » — ou « écrite par l''application », son écriture '
                    'étant alors tenue par une politique RLS. ⚠️ Ne pas répondre, c''est ce '
                    'qu''a fait la migration 026 pour « colonnes_personnelles » : elle a '
                    'AFFIRMÉ dans un commentaire que le rôle applicatif n''y avait que '
                    '« select », et le rôle applicatif pouvait la vider (constat Q-291).';
        return next;
    end loop;

    /* ── SENS 2 : un registre déclaré et introuvable ─────────────────────────────── */
    foreach v_nom in array v_registres loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'registre_declare_introuvable';
            detail   := 'table déclarée « registre technique » et introuvable : le contrôle '
                        'ne porte plus sur rien, et il couvrirait toute table future qui '
                        'reprendrait ce nom.';
            return next;
            continue;
        end if;

        /* ── SENS 3 : un registre RÉINSCRIPTIBLE — la mesure, pas la déclaration ── */
        for r in
            select rr.rolname::text as role_nom,
                   concat_ws(', ',
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'insert')   then 'insert'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'update')   then 'update'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'delete')   then 'delete'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'truncate') then 'truncate' end)
                       as verbes
              from pg_roles rr
             where rr.rolcanlogin and not rr.rolsuper
               and rr.oid <> (select d.datdba from pg_database d where d.datname = current_database())
               and (has_table_privilege(rr.oid, v_nom::regclass, 'insert')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'update')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'delete')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'truncate'))
             order by 1
        loop
            objet    := v_nom;
            anomalie := 'registre_reinscriptible';
            detail   := format('le rôle de connexion « %s » détient %s sur un registre '
                               'technique. Corriger : revoke insert, update, delete, truncate '
                               'on %I from %I;   ⚠️ Et vérifier « alter default privileges » : '
                               'c''est par là que colonnes_personnelles avait hérité des quatre '
                               'verbes sans qu''aucune ligne de sa migration ne le dise '
                               '(constat Q-291).',
                               r.role_nom, r.verbes, v_nom, r.role_nom);
            return next;
        end loop;
    end loop;

    /* ── SENS 4 : une table rangée « écrite par l'application » et introuvable ───── */
    foreach v_nom in array v_ecrites_par_l_application loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'table_rangee_introuvable';
            detail   := 'table déclarée « écrite par l''application » et introuvable : la '
                        'déclaration couvrirait toute table future qui reprendrait ce nom, '
                        'et lui accorderait le silence sans que personne ne décide.';
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_registres_techniques() is
    'Toute table dépourvue de « filiale_id » est RANGÉE : registre technique — que seul le '
    'déploiement écrit — ou table écrite par l''application. La liste est écrite à la main '
    'parce que la question appelle une DÉCISION humaine ; ce qui la rend sûre est que le '
    'balayage part du CATALOGUE et non d''elle, si bien qu''une table neuve non rangée fait '
    'rougir (CLAUDE.md §3, cas a). Et la propriété des registres est MESURÉE — '
    'has_table_privilege — jamais affirmée dans un commentaire : c''est le constat Q-291, où '
    'une migration avait écrit deux fois qu''une table était en lecture seule pendant que le '
    'rôle applicatif pouvait la vider.';

grant execute on function f_verifier_registres_techniques() to grc_app;

-- =====================================================================================
-- §2 — Q-292 : UN GARDE-FOU ÉVALUE LE PRÉDICAT, IL NE LIT PLUS SON TEXTE
-- =====================================================================================
--
-- Cinq garde-fous sur vingt-six lisent `pg_get_constraintdef()` et y cherchent des
-- sous-chaînes. Une contrainte **vidée de sa substance**, portant le même nom et citant
-- les mêmes littéraux, les satisfait tous — l'auditeur en a éprouvé deux, et les deux
-- sont tombés :
--
--   · `ck_documents_confidentialite` réécrite en `… or confidentialite is not null`
--     → 0 anomalie, et « diffusion libre » entre ;
--   · `ck_pieces_jointes_en_vigueur_integre` réécrite en `… is not null and … is not null`
--     → 0 anomalie, et une pièce dont l'intégrité est en ÉCART redevient « en vigueur »,
--     c'est-à-dire *celle qui fait référence*, dans un outil produit en audit.
--
-- ⚠️ **À décharge, et il faut le dire** : les mutations moins sournoises mordaient toutes
-- — retirer un niveau, supprimer la contrainte, rendre la colonne nullable, changer son
-- type. Le garde n'était pas creux ; il était **contournable par qui le lit**, ce qui est
-- le seul cas qui compte pour une barrière.
--
-- ── LE DISPOSITIF, et il ferme la classe ─────────────────────────────────────────────
--
-- `f_contrainte_accepte()` construit une ligne du type de la table à partir d'un objet
-- JSON, et **évalue le prédicat réel de la contrainte** dessus. Aucun texte n'est
-- comparé ; le résultat est celui que la base rendrait à l'écriture.
--
-- Ce qu'elle rend :
--   · `true`  — la contrainte ACCEPTE cette ligne (prédicat vrai, ou nul : « check »
--               est satisfaite par le nul, et c'est la règle de SQL, pas une nuance) ;
--   · `false` — elle la REFUSE ;
--   · `null`  — la contrainte est introuvable, ou son prédicat n'a pas pu être évalué.
--               L'appelant doit traiter ce cas : un garde qui prend « je n'ai pas pu
--               mesurer » pour « c'est bon » est exactement le défaut qu'on ferme.
--
-- ⚠️ **Ce qui est exécuté ne vient pas d'un utilisateur** : `pg_get_expr` rend
-- l'expression telle que le catalogue la détient, et les valeurs témoins voyagent en
-- PARAMÈTRE (`using`), jamais par concaténation.

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
    v_resultat boolean;
begin
    if v_oid is null then
        return null;
    end if;

    select pg_get_expr(k.conbin, k.conrelid) into v_predicat
      from pg_constraint k
     where k.conrelid = v_oid and k.conname = p_contrainte and k.contype = 'c';

    if v_predicat is null then
        return null;
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
        -- Une valeur témoin du mauvais type, une fonction absente : on ne sait pas, et on
        -- le DIT. Voir l'avertissement ci-dessus.
        return null;
    end;

    -- « check » est satisfaite quand le prédicat est vrai OU nul.
    return coalesce(v_resultat, true);
end;
$$;

comment on function f_contrainte_accepte(text, text, jsonb) is
    'ÉPROUVE une contrainte « check » : évalue son prédicat réel sur une ligne témoin et '
    'rend ce que la base répondrait — accepté (true), refusé (false), ou « je n''ai pas pu '
    'mesurer » (null). ⚠️ Elle existe parce que cinq garde-fous CHERCHAIENT DES '
    'SOUS-CHAÎNES dans pg_get_constraintdef() : une contrainte vidée de sa substance, '
    'portant le même nom et citant les mêmes littéraux, les satisfaisait tous (constat '
    'Q-292, qui est le constat Q-281 rouvert par les gardes écrits pour le fermer). '
    'Un garde qui envoie et constate ne peut pas être trompé par un « or true ».';

grant execute on function f_contrainte_accepte(text, text, jsonb) to grc_app;

-- ── Le pendant pour un DOMAINE ───────────────────────────────────────────────────────
-- Même principe, autre objet : `f_verifier_declencheurs_pieces()` extrait par expression
-- régulière les valeurs admises par le domaine `type_entite`. On ne remplace pas cette
-- extraction — elle ÉNUMÈRE, et une énumération ne se mesure pas —, mais on mesure le
-- sens qui porte la barrière : **une valeur que le produit emploie est-elle réellement
-- admise ?**

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
        execute format('select ($1::%s) is not null', p_domaine) into v_ok using p_valeur;
        return true;
    exception when others then
        return false;
    end;
end;
$$;

comment on function f_domaine_accepte(text, text) is
    'ÉPROUVE un domaine : tente la conversion d''une valeur témoin et constate. Pendant de '
    'f_contrainte_accepte() pour les domaines (constat Q-292).';

grant execute on function f_domaine_accepte(text, text) to grc_app;

-- ── §2 bis — LE GARDE UNIQUE QUI ÉPROUVE LES CONTRAINTES QUI PORTENT UNE BARRIÈRE ────
--
-- Un seul dispositif ferme les cinq gardes de la classe, et c'est délibéré : ajouter à
-- chacun sa propre évaluation aurait fait cinq endroits à tenir justes, donc cinq
-- endroits à oublier. Les gardes existants **restent** — ils attrapent les mutations
-- franches (contrainte supprimée, colonne rendue nullable, déclencheur déplacé) et ils
-- les attrapent bien, l'auditeur l'a mesuré. Celui-ci attrape la mutation que les cinq
-- laissaient passer : **la contrainte vidée qui garde son nom et ses mots.**
--
-- ⚠️ **La table des témoins est écrite à la main, et c'est ici le BON usage** : son
-- incomplétude n'ouvre aucune barrière — elle mesure moins, elle ne rassure pas à tort —
-- et chaque ligne EXIGE une décision humaine (« quelle valeur cette barrière doit-elle
-- refuser ? »), que rien dans le catalogue ne peut deviner. C'est le cas (a) du
-- `CLAUDE.md` §3.

create or replace function f_verifier_contraintes_eprouvees()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Chaque témoin : la table, la contrainte, la ligne d'essai, ce qu'on attend d'elle,
    -- et POURQUOI — le motif part dans le message, pour que celui qui lit l'anomalie
    -- sache ce qu'il vient de casser.
    v_temoins constant jsonb := jsonb_build_array(
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
    v_temoin   jsonb;
    v_accepte  boolean;
begin
    for v_temoin in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte(
            v_temoin ->> 't', v_temoin ->> 'c', v_temoin -> 'v');

        if v_accepte is null then
            objet    := (v_temoin ->> 't') || '.' || (v_temoin ->> 'c');
            anomalie := 'contrainte_non_eprouvable';
            detail   := format(
                'La contrainte est introuvable, ou son prédicat n''a pas pu être évalué sur '
                'la ligne témoin %s. ⚠️ « Je n''ai pas pu mesurer » ne vaut pas « c''est bon » : '
                'c''est exactement le défaut que ce garde ferme. Motif du témoin : %s.',
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
    return;
end;
$$;

comment on function f_verifier_contraintes_eprouvees() is
    'ÉPROUVE les contraintes qui portent une barrière : chaque témoin est une ligne dont on '
    'sait ce que la base doit en faire, et le prédicat RÉEL est évalué dessus. ⚠️ Il ne '
    'remplace pas les cinq gardes qui lisent pg_get_constraintdef() — ceux-là attrapent les '
    'mutations franches et les attrapent bien ; il attrape celle qu''ils laissaient tous '
    'passer : la contrainte VIDÉE qui garde son nom et ses mots (constat Q-292).';

grant execute on function f_verifier_contraintes_eprouvees() to grc_app;

-- =====================================================================================
-- §3 — Q-297 : LA COMPAGNE DOIT PROTÉGER *LA MÊME* COLONNE
-- =====================================================================================
--
-- `f_verifier_references_portee()` réclame, pour toute clé étrangère composite passant
-- par un `filiale_id` NULLABLE vers une table mixte, une **compagne** passant par
-- `portee_groupe`. Il ne vérifiait pas qu'elle protège la MÊME colonne référençante : il
-- lui suffisait qu'une clé de la même table vers la même cible mentionne `portee_groupe`
-- quelque part.
--
-- La mesure de l'auditeur — le témoin mord, la forme voisine passe :
--
--     fk_b_coherence    (document_id,   filiale_id)    -> documents (id, filiale_id)
--     fk_b_portee_autre (autre_doc_id,  portee_groupe) -> documents (id, portee_groupe)
--     → 0 anomalie, et `document_id` reste sans protection de portée.
--
-- Latent aujourd'hui — aucune table ne porte deux références composites vers la même
-- table mixte — mais « une table document remplacé par document » suffirait, et c'est
-- **exactement la forme que le constat N-10 décrit**.
--
-- ⚠️ **Le corps ci-dessous est repris de `pg_get_functiondef()`, pas de mémoire** : la
-- règle a coûté deux fois au chantier, dont une la veille (`f_pieces_suivent_leur_porteur`,
-- dont la mise en file `pieces_a_purger` avait été perdue). La seule différence est la
-- clause `and (…colonnes…)` du `not exists`, et le message qui la dit.

create or replace function f_verifier_references_portee()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    for r in
        -- Toute clé étrangère COMPOSITE dont l'une des colonnes référençantes est un
        -- `filiale_id` NULLABLE, et dont la table visée est MIXTE.
        select con.conname::text        as contrainte,
               src.relname::text        as source,
               cible.relname::text      as cible,
               con.conrelid             as src_oid,
               -- LES COLONNES PROTÉGÉES : tout ce que cette clé référence, hors la
               -- colonne de cloisonnement elle-même. C'est ce qu'une compagne doit
               -- couvrir — constat Q-297.
               (select array_agg(a.attname::text order by a.attname)
                  from pg_attribute a
                 where a.attrelid = con.conrelid
                   and a.attnum = any (con.conkey)
                   and a.attname <> 'filiale_id')     as colonnes_protegees
          from pg_constraint con
          join pg_class     src   on src.oid = con.conrelid
          join pg_class     cible on cible.oid = con.confrelid
          join pg_namespace n     on n.oid = src.relnamespace and n.nspname = 'public'
         where con.contype = 'f'
           and array_length(con.conkey, 1) > 1
           and cible.relname::text in (select nom from f_tables_mixtes())
           and exists (
                 select 1 from pg_attribute a
                  where a.attrelid = con.conrelid
                    and a.attnum = any (con.conkey)
                    and a.attname = 'filiale_id'
                    and not a.attnotnull)
         order by 1
    loop
        -- La compagne attendue : une autre clé étrangère de la MÊME table vers la MÊME
        -- cible, passant par `portee_groupe`, ET protégeant LES MÊMES colonnes. On ne
        -- compare pas les noms — un nom se change —, on compare les colonnes.
        if not exists (
            select 1
              from pg_constraint c2
              join pg_class cible2 on cible2.oid = c2.confrelid
             where c2.contype = 'f'
               and c2.conrelid = r.src_oid
               and cible2.relname::text = r.cible
               and exists (
                     select 1 from pg_attribute a2
                      where a2.attrelid = c2.conrelid
                        and a2.attnum = any (c2.conkey)
                        and a2.attname = 'portee_groupe')
               -- ══ Q-297 : *LA* compagne, pas *UNE* compagne ══════════════════════
               -- Sans cette clause, une clé posée sur une AUTRE colonne référençante
               -- suffisait — et la colonne examinée restait nue sous un verdict vert.
               and (select array_agg(a2.attname::text order by a2.attname)
                      from pg_attribute a2
                     where a2.attrelid = c2.conrelid
                       and a2.attnum = any (c2.conkey)
                       and a2.attname <> 'portee_groupe')
                   = r.colonnes_protegees)
        then
            objet    := r.source || '.' || r.contrainte;
            anomalie := 'reference_portee_sans_compagne';
            detail   := format(
                'Cette clé étrangère composite vise « %s », qui est MIXTE, en passant par un '
                'filiale_id NULLABLE : quand filiale_id est nul — c''est-à-dire pour toute '
                'ligne de portée Groupe — la règle « match simple » la neutralise et elle ne '
                'vérifie plus RIEN. Il manque une seconde clé vers « %s » passant par la '
                'colonne engendrée portee_groupe, qui n''est jamais nulle, ET protégeant LA '
                'MÊME colonne référençante (%s). Sans elle, une ligne de portée GROUPE peut '
                'désigner une ligne LOCALE d''une filiale, et la suppression ordinaire de '
                'celle-ci emporte le socle commun (constat N-10, porte S1). ⚠️ La clause '
                '« la même colonne » vient du constat Q-297 : une compagne posée sur une '
                'AUTRE colonne satisfaisait le garde et ne protégeait rien.',
                r.cible, r.cible, array_to_string(r.colonnes_protegees, ', '));
            return next;
        end if;
    end loop;
    return;
end;
$$;

comment on function f_verifier_references_portee() is
    'Toute clé étrangère composite vers une table MIXTE, passant par un filiale_id nullable, '
    'a une compagne passant par portee_groupe ET protégeant LA MÊME colonne référençante. '
    'La seconde moitié vient du constat Q-297 : le garde se contentait qu''une clé de la '
    'table mentionne portee_groupe quelque part, si bien qu''une compagne posée sur une '
    'autre colonne le satisfaisait pendant que la colonne examinée restait nue.';

-- =====================================================================================
-- §4 — Q-299 : LE VERROU D'APPROBATION DÉCOUVRE SES COLONNES
-- =====================================================================================
--
-- L'exception d'anonymisation ouverte par `026` §3 et réémise par `027` §4 bis comparait
-- **dix colonnes une à une**. `approbations` en porte dix-huit. `cree_le`, `cree_par`,
-- `version` et les deux `modifie_*` sont tenus par `f_maj_tracabilite()` — mesuré et
-- confirmé par l'auditeur. **`id`, lui, n'était tenu par personne** :
--
--     update approbations set id = 'APP-FALSIFIE', acteur_libelle = f_mention_neutre()
--      where id = 'APP-A1';                                    -- → ACCEPTÉ
--
-- Renommer l'identifiant d'une décision rendue **détache silencieusement ses pièces
-- jointes** (`trg_approbations_pieces` les relie par `(entite_type, entite_id)`, sans clé
-- étrangère) : c'est la classe Q-232/Q-233. Non atteignable par la route — le registre
-- d'entités exclut `id` des colonnes modifiables — mais la propriété ÉCRITE (« la
-- décision ne se modifie ni ne s''efface, y compris en SQL, y compris pour
-- l''administrateur ») était plus large que la propriété TENUE.
--
-- ⚠️ **Et surtout : toute colonne ajoutée demain à `approbations` devenait librement
-- modifiable sous couvert d'anonymisation, sans qu'un mot le dise.**
--
-- ── LE RENVERSEMENT ──────────────────────────────────────────────────────────────────
--
-- On n'énumère plus ce qui NE DOIT PAS bouger : on compare la ligne entière, moins ce qui
-- a le droit de bouger. **Une colonne neuve est protégée d'office.** La liste des
-- exceptions reste écrite à la main — et c'est le bon sens de la polarité : l'oublier
-- rend une colonne *plus* protégée, jamais moins. Une omission fait échouer bruyamment
-- une anonymisation légitime ; elle n'ouvre rien.
--
-- ⚠️ **Le corps vient de `pg_get_functiondef()`**, y compris les trois lignes du `DELETE`
-- qui avaient été perdues une fois — le commentaire qui les garde est conservé mot pour
-- mot, parce qu'il porte la leçon.

create or replace function f_approbations_verrou_decision() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_statut        text := old.statut;
    v_anonymisation boolean;
    -- CE QUI A LE DROIT DE BOUGER, et rien d'autre. Tout le reste de la ligne — y compris
    -- une colonne ajoutée demain — est comparé en bloc (constat Q-299).
    --   · acteur_id / acteur_libelle : c'est l'objet même de l'anonymisation ;
    --   · version, cree_le, cree_par, modifie_le, modifie_par : tenus par
    --     f_maj_tracabilite(), qui les REPOSE — les comparer ici ferait échouer toute
    --     écriture légitime selon l'ordre des déclencheurs.
    v_hors_decision constant text[] := array[
        'acteur_id', 'acteur_libelle',
        'version', 'cree_le', 'cree_par', 'modifie_le', 'modifie_par'
    ];
begin
    if v_statut in ('approuve', 'refuse') then
        if tg_op = 'UPDATE' then
            -- L'écriture ne touche-t-elle QUE l'identité de l'acteur ? La ligne est
            -- comparée EN BLOC, moins les colonnes ci-dessus : rien d'autre ne peut
            -- bouger, et une colonne future est couverte sans qu'une ligne change.
            v_anonymisation :=
                    (to_jsonb(new) - v_hors_decision) = (to_jsonb(old) - v_hors_decision)
                -- …et elle doit RETIRER l'acteur, jamais le REMPLACER. Le compte peut être
                -- délié (nul) ou rester tel quel — la purge anonymise la fiche
                -- `utilisateurs` par ailleurs —, mais il ne peut pas devenir QUELQU'UN
                -- D'AUTRE : ce serait attribuer la décision à un tiers.
                and (new.acteur_id is null or new.acteur_id is not distinct from old.acteur_id)
                -- Le libellé part, ou devient la mention neutre du §35.3. Ces deux valeurs
                -- et elles seules : toute autre serait une substitution de nom.
                and coalesce(new.acteur_libelle, '') in ('', f_mention_neutre());
            if v_anonymisation then
                return new;
            end if;
        end if;

        raise exception
            'Étape d''approbation déjà tranchée (%) : la décision est irréversible.', v_statut
            using errcode = 'GRC02',
                  hint    = 'Créez une nouvelle version de l''objet : le circuit repart du début. '
                            'Voir backend/db/CONVENTIONS.md §15. ⚠️ Une ANONYMISATION est admise '
                            '— elle retire l''acteur sans toucher à la décision, et c''est ce qui '
                            'permet au produit de répondre à une demande d''effacement RGPD sans '
                            'détruire la preuve que le circuit a eu lieu (constat Q-284).';
    end if;

    -- ⚠️ **CES TROIS LIGNES ONT ÉTÉ PERDUES UNE FOIS, ET LE BANC L'A DIT.** Le déclencheur
    -- est « before update OR DELETE » : dans une suppression, `new` est NUL, et un
    -- « return new » ANNULE la suppression au lieu de la laisser passer. Une étape
    -- « annule » ou « en_attente » — qui n'a rien tranché — devenait indestructible, en
    -- silence. C'est la faute exacte que le 10/09 avait déjà coûtée sur
    -- `f_pieces_suivent_leur_porteur()` : *on ne remplace pas une fonction dont on n'a lu
    -- qu'une partie.* Ici c'est le corps de la `026` qui a été réécrit de mémoire ; le
    -- corps appliqué se lit avec `pg_get_functiondef()`, et c'est de là qu'il vient
    -- désormais.
    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

comment on function f_approbations_verrou_decision() is
    'Une décision d''approbation tranchée ne se modifie ni ne s''efface — y compris en SQL, y '
    'compris pour l''administrateur. SEULE exception : l''ANONYMISATION de l''acteur, qui '
    'retire le nom sans toucher à la décision (constat Q-284). ⚠️ La ligne est comparée EN '
    'BLOC, moins les colonnes qui ont le droit de bouger : une colonne ajoutée demain est '
    'protégée d''office. L''ancienne rédaction énumérait dix colonnes sur dix-huit, et « id » '
    'n''y était pas — renommer l''identifiant d''une décision rendue détachait ses pièces '
    'jointes en silence (constat Q-299).';

-- =====================================================================================
-- §5 — Q-300 : LE REGISTRE IMPOSE LA COHÉRENCE DE TYPE
-- =====================================================================================
--
-- `colonnes_personnelles` porte cinq contraintes « check » ; aucune ne vérifiait que la
-- colonne déclarée **existe avec un type textuel**. Le garde vérifiait l'existence, jamais
-- le type. Mesuré :
--
--     insert into colonnes_personnelles values
--       ('documents','donnees_personnelles','personnelle',…,'anonymiser',…);  -- accepté
--     select count(*) from f_verifier_schema();                               -- → 0
--     -- puis, la requête que la purge construit à partir de cette ligne :
--     ERROR:  function string_to_array(boolean, text) does not exist
--
-- La purge est **transactionnelle** : cette erreur l'avorte entièrement — aucune
-- anonymisation, aucune suppression de fiche. ⚠️ **Et il se composait avec Q-291** : le
-- rôle applicatif pouvant écrire le registre, une seule ligne fautive suffisait à
-- paralyser durablement la purge RGPD de TOUTES les filiales, `f_verifier_schema()` au
-- vert. Le §1 ferme la moitié « qui peut écrire » ; celui-ci ferme la moitié « ce qui
-- peut être écrit ».
--
-- ⚠️ **Ce n'est pas une contrainte « check »**, et le motif est mesuré : une contrainte
-- ne peut pas interroger `pg_attribute` (elle serait non immuable). C'est donc le
-- garde-fou qui le tient — au même endroit que les deux sens qu'il porte déjà, et il est
-- rejoué par `f_verifier_schema()` à chaque migration et à chaque installation.
--
-- Le corps vient de `pg_get_functiondef()` ; le sens 3 est neuf, les sens 1 et 2 sont
-- inchangés. ⚠️ Le sens 1 est **réécrit au §2 de la migration 029** (constats Q-295 et
-- Q-296) ; ici il est reconduit tel quel.

create or replace function f_verifier_colonnes_personnelles()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    /* ── SENS 1 : une colonne CANDIDATE non décidée ──────────────────────────────── */
    for r in
        select c.relname::text as table_nom, a.attname::text as colonne
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         where c.relkind = 'r'
           and format_type(a.atttypid, a.atttypmod) = 'text'
           and c.relname <> 'colonnes_personnelles'
           and a.attname not in ('cree_par', 'modifie_par')
           and ( a.attname ~ '(responsable|proprietaire|auditeur|participants|suppleant|acteur|prenom|email|telephone|^nom$|nom_court|nom_affichage|libelle|identifiant|^upn$|sid_ad|adresse_ip|agent_utilisateur)'
                 or c.relname in ('utilisateurs', 'personnes', 'crise', 'sessions') )
           and not exists (select 1 from colonnes_personnelles p
                            where p.table_nom = c.relname and p.colonne = a.attname)
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'colonne_personnelle_non_decidee';
        detail   := 'Cette colonne textuelle peut porter une donnée personnelle, et le '
                    'registre « colonnes_personnelles » ne dit RIEN d''elle. Décidez : '
                    '« personnelle » — avec sa finalité, sa base légale, sa durée et ce '
                    'qu''on en fait à l''expiration — ou « non_personnelle », avec sa '
                    'justification. ⚠️ « Non personnelle » est une réponse recevable ; ne '
                    'pas répondre ne l''est pas : la purge RGPD laisserait alors la donnée '
                    'en place en annonçant « terminé ».';
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
         where p.nature = 'personnelle'
           and p.a_expiration in ('anonymiser', 'signaler')
           and format_type(a.atttypid, a.atttypmod) not in ('text', 'character varying')
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'declaration_personnelle_de_mauvais_type';
        detail   := format(
            'Le registre déclare cette colonne « personnelle · %s », et elle est de type '
            '« %s ». La purge y cherche un NOM : elle construit une comparaison textuelle, '
            'et la base la refuse — « function string_to_array(boolean, text) does not '
            'exist ». ⚠️ La purge est TRANSACTIONNELLE : une seule déclaration de ce genre '
            'l''avorte ENTIÈREMENT, pour toutes les filiales, aucune anonymisation, aucune '
            'suppression de fiche (constat Q-300). Déclarez « conserver » ou « supprimer », '
            'ou corrigez le nom de la colonne.',
            r.a_expiration, r.typ);
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_colonnes_personnelles() is
    'DANS TROIS SENS : toute colonne textuelle susceptible de porter une donnée personnelle '
    'est DÉCIDÉE au registre ; toute déclaration du registre désigne une colonne qui existe ; '
    'et toute déclaration dont le régime fait chercher un NOM porte sur une colonne TEXTUELLE '
    '(constat Q-300 — une déclaration booléenne avortait la purge entière, toutes filiales '
    'confondues, sous un f_verifier_schema() au vert). ⚠️ Les colonnes de traçabilité '
    '« cree_par » / « modifie_par » sont hors balayage : elles portent un LOGIN, déjà couvert '
    'par utilisateurs.identifiant.';

-- =====================================================================================
-- §6 — CONSIGNATION
-- =====================================================================================

-- Vérification immédiate : un garde-fou qui ne s'applique pas à sa propre migration est
-- un commentaire. Les trois gardes neufs sont DÉCOUVERTS par f_verifier_schema() à la
-- convention de nom et de signature, jamais ajoutés à une liste (CONVENTIONS.md §18.4).
do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s / %s : %s', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 028 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, les contraintes éprouvées comprises.';
end;
$$;

insert into migrations_schema (version, nom)
values ('028', 'les garde-fous éprouvent au lieu de reconnaître — registre RGPD fermé en '
               'écriture, prédicats évalués sur témoins, compagne de portée sur la même '
               'colonne, verrou d''approbation qui découvre ses colonnes, cohérence de type '
               'du registre (constats Q-291, Q-292, Q-297, Q-299, Q-300)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   grant insert, update, delete on colonnes_personnelles to grc_app;
--   drop function if exists f_verifier_registres_techniques();
--   drop function if exists f_verifier_contraintes_eprouvees();
--   drop function if exists f_contrainte_accepte(text, text, jsonb);
--   drop function if exists f_domaine_accepte(text, text);
--   delete from controles_schema where fonction in
--       ('f_verifier_registres_techniques', 'f_verifier_contraintes_eprouvees');
--   delete from migrations_schema where version = '028';
--   commit;
--   -- ⚠️ Les trois fonctions REMPLACÉES (f_verifier_references_portee,
--   --    f_approbations_verrou_decision, f_verifier_colonnes_personnelles) ne se
--   --    rétablissent pas par un « drop » : il faut rejouer 026 et 027 §4 bis.
-- =====================================================================================
