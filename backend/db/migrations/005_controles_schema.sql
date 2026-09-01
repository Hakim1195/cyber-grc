-- =====================================================================================
-- 005_controles_schema.sql — Un garde-fou qui cesse d'être découvert ne s'efface plus
-- =====================================================================================
-- Constat Q-5 de la porte de sécurité S2 (docs/PLAN_EXECUTION.md §7). Cette migration
-- ne crée aucune table métier et ne touche à aucune donnée : elle ferme un angle mort du
-- DISPOSITIF DE CONTRÔLE lui-même, et corrige deux commentaires devenus faux.
--
-- Références : backend/db/CONVENTIONS.md §18.4 (un garde-fou que rien n'appelle est un
-- commentaire), §19.4 (un garde-fou neuf se branche dans le même commit qu'il naît),
-- §19.5 (un garde-fou découvre son périmètre, il ne le récite pas), §20.1 (une
-- découverte automatique est un contrat d'exécution de code), §23 (une migration
-- appliquée ne se réécrit pas).
--
-- Dépendances : 001 à 004. Contenu :
--   §0  Gardes (version PostgreSQL, migrations précédentes)
--   §1  Le registre des garde-fous observés : table controles_schema
--   §2  Privilèges et Row Level Security du registre
--   §3  La découverte, extraite en source unique : f_decouvrir_controles_schema()
--   §4  L'écriture de l'observation : f_consigner_controles_schema()
--   §5  Le retrait EXPLICITE d'un contrôle : f_retirer_controle_schema()
--   §6  f_verifier_schema() réémise : elle découvre, elle joue, et elle COMPARE
--   §7  f_verifier_couverture_rls() réémise : une exemption de plus
--   §8  f_verifier_privileges() réémise : les registres techniques restent fermés
--   §9  Constat Q-6 (b) : deux commentaires rendus faux par le correctif T-4
--   §10 Traçabilité d'insertion, armement, CONSIGNATION, puis vérification
--   §11 Enregistrement de la migration
--
-- -------------------------------------------------------------------------------------
-- LE DÉFAUT, TEL QU'IL A ÉTÉ ÉTABLI ET REJOUÉ (constat Q-5)
--
-- f_verifier_schema() DÉCOUVRE ses contrôles dans le catalogue au lieu de les réciter.
-- C'est la bonne parade au motif « liste écrite à la main » (§19.5), et elle n'est pas en
-- cause : elle supprime l'occasion d'oublier de BRANCHER un garde-fou neuf.
--
-- Elle l'introduisait au RETRAIT. Le point d'appel ne refusait que s'il ne découvrait
-- PLUS RIEN. Deux scénarios, joués sur une base réelle, rendaient tous deux
-- « aucune anomalie » et un code de sortie zéro :
--
--   1. « drop function f_verifier_entropie_identifiants() » — le contrôle a disparu, sept
--      autres tournent encore, et le point d'appel se tait ;
--   2. plus réaliste, et plus grave parce qu'aucune malveillance n'est requise : CHANGER
--      LA SIGNATURE de f_verifier_couverture_rls (un argument par défaut ajouté), puis
--      désactiver la Row Level Security sur « risques ». La découverte ne reconnaît plus
--      la fonction — la convention exige zéro argument —, la RLS est tombée, et le
--      déploiement annonce un schéma conforme.
--
-- Une migration qui renomme ou re-signe une fonction suffit à produire cela. Elle passe
-- la revue : elle ne touche pas au contrôle, elle touche à son enveloppe.
--
-- CE QUI FERME, ET POURQUOI PAS AUTREMENT
--
--   - ON CONSIGNE LES NOMS ET LES SIGNATURES, PAS LEUR NOMBRE. Compter n'attrape pas le
--     second scénario : une re-signature laisse le total inchangé si une autre fonction
--     apparaît, et le nombre ne dit jamais LEQUEL manque.
--   - LA RÈGLE EST L'ABSENCE, PAS LA DIFFÉRENCE. Tout contrôle présent à la dernière
--     observation et absent de la découverte courante est une anomalie ; les nouveaux
--     s'ajoutent librement. C'est ce qui PRÉSERVE le §19.4 : un garde-fou neuf se branche
--     toujours sans qu'aucun fichier change.
--   - LA COMPARAISON VIT DANS LE CORPS DE f_verifier_schema(), JAMAIS DANS UN CONTRÔLE
--     DÉCOUVERT. Un contrôle qui surveillerait la découverte et serait lui-même découvert
--     se supprimerait en emportant sa propre surveillance. Il faut couper là.
--   - LE REGISTRE NE SE VIDE PAS TOUT SEUL. Retirer légitimement un contrôle reste
--     possible, mais par une instruction EXPLICITE dans une migration
--     (f_retirer_controle_schema, §5) : un geste visible et relu, pas un effet de bord.
--
-- OÙ L'OBSERVATION S'ÉCRIT, ET POURQUOI PAS DANS LE POINT D'APPEL
--
-- f_verifier_schema() est jouée par db/migrate.mjs et par deploy/install.sh dans une
-- transaction EN LECTURE SEULE (« set transaction read only », §20.1) : elle COMPARE,
-- elle n'écrit pas. L'écriture appartient au moment où une MIGRATION s'applique, sous le
-- compte propriétaire — c'est f_consigner_controles_schema(), appelée en fin de fichier
-- par toute migration, et par db/migrate.mjs après une application réussie (jamais sous
-- « --verifier », dont la promesse est « aucune écriture »).
--
-- Conséquence à connaître : deploy/install.sh, qui rejoue les garde-fous SANS appliquer
-- de migration, compare sans consigner. C'est exactement ce qu'on attend de lui.
--
-- CE QUE CE MÉCANISME NE FAIT PAS, et le §17.5 impose de le dire : il compare une
-- PRÉSENCE, pas un contenu. Un contrôle dont le corps serait vidé de sa substance —
-- même nom, même signature, « return; » pour tout corps — reste découvert, reste joué,
-- et ne remonte rien. Rien ici ne l'attrape ; ce qui mord là, ce sont les tests de
-- comportement de test/base/rls.test.mjs, qui cassent la propriété et exigent que le
-- garde-fou la voie (§20.2). Et le registre lui-même ne vaut que fermé : c'est le §8 qui
-- le tient, à chaque déploiement.
--
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 005_controles_schema.sql
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

-- Cette migration RÉÉMET trois fonctions posées par 001 et 004. Sans ce garde, l'échec
-- serait un « function … does not exist » sans indication de la marche à suivre.
do $$
declare
    v_manquantes text;
begin
    select string_agg(f, ', ' order by f)
      into v_manquantes
      from unnest(array['f_verifier_schema()', 'f_verifier_couverture_rls()',
                        'f_verifier_privileges()', 'f_poser_tracabilite_insertion()',
                        'f_armer_declencheurs()', 'f_maj_horodatage()']) as f
     where to_regprocedure('public.' || f) is null;

    if v_manquantes is not null then
        raise exception
            'Migrations 001 à 004 non toutes appliquées : fonction(s) manquante(s) : %.',
            v_manquantes
            using hint = 'Ordre imposé : 001_socle.sql, 002_metier_noyau.sql, '
                         '003_metier_operations.sql, 004_rls.sql, puis ce fichier. '
                         'Voir backend/db/CONVENTIONS.md §16.1.';
    end if;
end;
$$;

-- =====================================================================================
-- §1 — LE REGISTRE DES GARDE-FOUS OBSERVÉS
-- -------------------------------------------------------------------------------------
-- Une table, et non un compteur : le nombre ne dit jamais LEQUEL manque, et il ne voit
-- pas une re-signature. Une table, et non une liste dans le corps d'une fonction : ce
-- serait la liste écrite à la main que le §19.5 proscrit, et il faudrait la retoucher à
-- chaque garde-fou neuf — c'est-à-dire retrouver l'occasion d'oublier que la découverte
-- vient de supprimer.
--
-- Ce n'est PAS une table métier (CONVENTIONS.md §3) : ni « version », ni verrouillage
-- optimiste. C'est un registre technique, de même nature que migrations_schema, avec la
-- traçabilité réduite des tables filles — qui a écrit, quand — et son déclencheur de
-- modification (§3 du document normatif).
-- =====================================================================================

create table controles_schema (
    fonction    text        not null,
    signature   text        not null,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_controles_schema primary key (fonction),
    -- La convention d'écriture d'un garde-fou de schéma tient dans son nom : le registre
    -- refuse d'enregistrer autre chose, plutôt que d'accueillir n'importe quelle ligne
    -- qui ferait ensuite échouer tous les déploiements.
    constraint ck_controles_schema_fonction  check (fonction ~ '^f_verifier_.+$'),
    constraint ck_controles_schema_signature check (signature <> '')
);

create trigger trg_controles_schema_maj before update on controles_schema
    for each row execute function f_maj_horodatage();

comment on table controles_schema is
    'DERNIÈRE OBSERVATION des garde-fous de schéma joués par f_verifier_schema() : un nom de '
    'fonction, sa signature, et quand elle a été observée. Sert à une seule chose, et c''est '
    'le constat Q-5 : TOUT CONTRÔLE PRÉSENT ICI ET ABSENT DE LA DÉCOUVERTE COURANTE EST UNE '
    'ANOMALIE. Sans ce registre, supprimer ou re-signer un garde-fou le faisait disparaître '
    'du point d''appel SANS BRUIT — sept contrôles sur huit tournaient encore, et le '
    'déploiement annonçait « aucune anomalie » sur une base dont la RLS était tombée. '
    'Les contrôles NEUFS s''ajoutent librement (c''est la propriété du §19.4 : se brancher '
    'sans qu''aucun fichier change) ; seule leur DISPARITION est refusée. '
    'ÉCRIT par f_consigner_controles_schema(), sous le compte propriétaire, au moment où une '
    'migration s''applique — jamais par f_verifier_schema(), qui est jouée en transaction '
    '« read only ». LU par f_verifier_schema(). '
    'RETIRER LÉGITIMEMENT UN CONTRÔLE, mode d''emploi — c''est un geste explicite, pas un '
    'effet de bord : (1) supprimez ou renommez la fonction dans une migration ; (2) dans la '
    'MÊME migration, écrivez « select f_retirer_controle_schema(''f_verifier_<x>'', ''motif '
    'du retrait''); ». La migration est la trace : elle est relue, datée et conservée. Ne '
    'JAMAIS vider ce registre par un « delete » nu pour faire passer un déploiement — c''est '
    'l''alarme qu''on éteint, pas le défaut qu''on corrige.';

comment on column controles_schema.fonction is
    'Nom de la fonction garde-fou, « f_verifier_<x> ». Clé du registre : la convention de '
    'découverte impose zéro argument, il ne peut donc exister qu''une fonction de ce nom.';
comment on column controles_schema.signature is
    'Signature complète telle que le catalogue la rend au moment de l''observation : '
    'nom, arguments d''identité, type de retour. POURQUOI CETTE REPRÉSENTATION, et pas une '
    'autre : « oid::regprocedure » ne porte que le nom et les types d''arguments — un type '
    'de RETOUR élargi (une colonne « gravite » ajoutée) sort la fonction de la découverte '
    'sans changer d''un caractère ; « pg_get_function_arguments » ferait varier la signature '
    'sur une simple valeur par défaut, qui ne change rien à l''appel. Le couple '
    '(pg_get_function_identity_arguments, pg_get_function_result) est le seul qui distingue '
    'RÉELLEMENT les deux formes de re-signature, et rien d''autre. '
    'Pour un contrôle DÉCOUVERT, cette valeur est constante par construction — la découverte '
    'exige déjà cette forme exacte. Elle n''est donc pas un discriminant de plus : elle date '
    'la CONVENTION sous laquelle le contrôle a été consigné, et elle permet de nommer '
    'précisément l''écart le jour où la découverte cesse de le reconnaître (« consigné sous '
    'X, trouvé sous Y ») — la différence entre « on a retiré un garde-fou » et « on l''a '
    'sorti du point d''appel sans le vouloir ».';

-- =====================================================================================
-- §2 — PRIVILÈGES ET ROW LEVEL SECURITY DU REGISTRE
-- -------------------------------------------------------------------------------------
-- ON VÉRIFIE CE QUE LES PRIVILÈGES PAR DÉFAUT DONNENT, ON NE LE SUPPOSE PAS (§18.5).
-- 001_socle.sql §0 pose « alter default privileges … grant select, insert, update, delete
-- on tables to grc_app » AVANT de créer la moindre table : toute table créée ensuite —
-- celle-ci comprise — arrive avec les quatre verbes accordés au rôle applicatif. Une
-- supposition de cette nature a déjà produit un constat sur ce chantier ; on ferme donc
-- explicitement, exactement comme 004 §1 le fait pour migrations_schema.
--
-- Le « select » RESTE accordé, et ce n'est pas une négligence : f_verifier_privileges()
-- contrôle le sens inverse (« colonne_illisible_au_service ») — une colonne fermée au
-- compte du service sans être un secret est un défaut d'exploitation qui ne se voit qu'en
-- production. Le registre n'a d'ailleurs rien de confidentiel : il ne contient que des
-- noms de fonctions.
-- =====================================================================================

revoke insert, update, delete, truncate on controles_schema from public;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'revoke insert, update, delete, truncate on controles_schema from grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'revoke insert, update, delete, truncate on controles_schema from grc_lecture';
    end if;
end;
$$;

-- Et on CONSTATE la fermeture au lieu de la déclarer. Ce bloc fait échouer la migration ;
-- le contrôle durable, rejoué à chaque déploiement, est au §8.
do $$
declare
    v_trop text;
begin
    if not exists (select 1 from pg_roles where rolname in ('grc_app', 'grc_lecture')) then
        raise notice 'Rôles grc_app / grc_lecture absents : fermeture du registre SANS OBJET '
                     'sur cette base (db/dev/preparer_base_dev.sh).';
        return;
    end if;

    select string_agg(format('%s → %s', rr.rolname, p), ', ' order by rr.rolname, p)
      into v_trop
      from pg_roles rr
     cross join unnest(array['insert', 'update', 'delete', 'truncate']) as p
     where rr.rolname in ('grc_app', 'grc_lecture')
       and has_table_privilege(rr.oid, 'controles_schema'::regclass, p);

    if v_trop is not null then
        raise exception
            'Le registre des garde-fous reste réinscriptible par un rôle de connexion (%). '
            'Un registre que le service peut vider est une alarme qu''il peut éteindre.', v_trop
            using errcode = '42501',
                  hint = 'revoke insert, update, delete, truncate on controles_schema from grc_app;';
    end if;

    -- Le sens inverse (§20.2) : ce qui doit rester permis l'est. Le service et la
    -- supervision LISENT le registre — f_verifier_privileges() refuserait d'ailleurs une
    -- colonne devenue illisible au compte du service.
    if not has_table_privilege('grc_app', 'controles_schema'::regclass, 'select') then
        raise exception
            'Le compte du service ne peut pas LIRE controles_schema : le correctif aurait '
            'créé un défaut en fermant l''autre (CONVENTIONS.md §20.2).'
            using errcode = '42501',
                  hint = 'grant select on controles_schema to grc_app;';
    end if;

    raise notice 'Registre des garde-fous : lecture ouverte, écriture réservée au propriétaire.';
end;
$$;

-- La RLS est armée et FORCÉE comme sur les 47 autres tables : f_verifier_couverture_rls()
-- l'exige de toute table du schéma public, et la démonstration de recette la recompte
-- (db/verifier_cloisonnement.sql, contrôle C27). Les politiques sont ouvertes, comme
-- celles de migrations_schema : ce registre ne contient aucune donnée de filiale, et ce
-- qui le protège est le privilège, pas le prédicat.
alter table controles_schema enable row level security;
alter table controles_schema force row level security;

create policy pol_controles_schema_lecture on controles_schema
    for select using (true);
create policy pol_controles_schema_ajout on controles_schema
    for insert with check (true);
create policy pol_controles_schema_maj on controles_schema
    for update using (true) with check (true);
create policy pol_controles_schema_suppression on controles_schema
    for delete using (true);

comment on policy pol_controles_schema_lecture on controles_schema is
    'Registre technique de niveau socle : aucune donnée de filiale, et la lecture est '
    'nécessaire AVANT que le périmètre existe — f_verifier_schema() le lit à chaque '
    'migration et à chaque installation. La RLS est armée et explicite, mais ouverte.';
comment on policy pol_controles_schema_ajout on controles_schema is
    'Écriture ouverte au niveau des POLITIQUES, fermée au niveau des PRIVILÈGES : seul le '
    'compte propriétaire écrit ici, au moment où une migration s''applique (005 §2). Une '
    'politique conditionnelle n''apporterait rien de plus et donnerait à croire que la '
    'fermeture vient d''elle.';
comment on policy pol_controles_schema_maj on controles_schema is 'Idem ajout.';
comment on policy pol_controles_schema_suppression on controles_schema is 'Idem ajout.';

-- =====================================================================================
-- §3 — LA DÉCOUVERTE, EXTRAITE EN SOURCE UNIQUE
-- -------------------------------------------------------------------------------------
-- Le prédicat de découverte vivait dans le corps de f_verifier_schema(). Il faut
-- désormais l'appliquer à DEUX endroits — jouer les contrôles, et consigner ce qui a été
-- joué — et deux copies d'un même prédicat se désynchronisent : c'est le motif qui a
-- produit quatre défauts sur ce chantier (§19.5). Il est donc extrait ici, une fois.
--
-- LA CONVENTION D'ÉCRITURE D'UN GARDE-FOU DE SCHÉMA, inchangée depuis 001 : une fonction
-- du schéma public, nommée « f_verifier_<x> », SANS AUCUN ARGUMENT, rendant exactement
-- « table (objet text, anomalie text, detail text) ». La respecter suffit à être joué, par
-- le déploiement comme par la recette, sans toucher à aucun fichier.
--
-- ET LES QUATRE PROPRIÉTÉS QUI SÉPARENT UN GARDE-FOU D'UNE GREFFE (§20.1, constat Q5-1) :
-- appartenir au propriétaire de la base, ne pas être « security definer », ne pas être
-- volatile, figer son chemin de recherche. Elles sont CALCULÉES ici ; c'est l'appelant qui
-- décide quoi en faire — jouer, constater, ou consigner.
-- =====================================================================================

create or replace function f_decouvrir_controles_schema()
returns table (fonction text, controle text, signature text, conforme boolean, proprietes text)
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select p.proname::text,
           substring(p.proname::text from '^f_verifier_(.+)$'),
           -- La signature retenue : arguments d'IDENTITÉ (les valeurs par défaut ne
           -- changent pas l'appel) et type de RETOUR (qu'un « oid::regprocedure »
           -- ignorerait, alors qu'il suffit à sortir la fonction de la découverte).
           format('%s(%s) returns %s', p.proname::text,
                  pg_get_function_identity_arguments(p.oid),
                  pg_get_function_result(p.oid)),
           (p.proowner = d.datdba)
             and not p.prosecdef
             and p.provolatile <> 'v'
             and exists (
                 select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as c
                  where c like 'search\_path=%'
                    and btrim(btrim(split_part(
                            c, ',', array_length(string_to_array(c, ','), 1))), '"')
                        = 'pg_temp'),
           format('propriétaire de la base = %s, security definer = %s, volatile = %s, '
                  'chemin de recherche figé = %s',
                  (p.proowner = d.datdba), p.prosecdef, (p.provolatile = 'v'),
                  exists (
                      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as c
                       where c like 'search\_path=%'
                         and btrim(btrim(split_part(
                                 c, ',', array_length(string_to_array(c, ','), 1))), '"')
                             = 'pg_temp'))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     cross join pg_database d
     where n.nspname = 'public'
       and d.datname = current_database()
       and p.prokind = 'f'
       and p.proname::text like 'f\_verifier\_%'
       and p.pronargs = 0
       and pg_get_function_result(p.oid) = 'TABLE(objet text, anomalie text, detail text)'
     order by p.proname;
$$;

comment on function f_decouvrir_controles_schema() is
    'SOURCE UNIQUE de la découverte des garde-fous de schéma (CONVENTIONS.md §19.4 et '
    '§19.5) : toute fonction « public.f_verifier_<x>() », sans argument, rendant '
    '(objet, anomalie, detail). Rend pour chacune sa signature et le verdict de conformité '
    '— appartenir au propriétaire de la base, n''être ni « security definer » ni volatile, '
    'figer son chemin de recherche (§20.1, constat Q5-1). Elle ne décide de rien : '
    'f_verifier_schema() joue les conformes et constate les autres, '
    'f_consigner_controles_schema() consigne les conformes. Extraite pour qu''il n''existe '
    'pas DEUX copies du même prédicat — le motif exact qui a produit quatre défauts.';

-- =====================================================================================
-- §4 — L'ÉCRITURE DE L'OBSERVATION
-- -------------------------------------------------------------------------------------
-- ELLE N'AJOUTE ET NE MET À JOUR, ELLE NE SUPPRIME JAMAIS. C'est toute la mécanique : un
-- garde-fou neuf s'inscrit tout seul (§19.4), et un garde-fou disparu laisse sa ligne
-- derrière lui — c'est cette ligne qui devient l'anomalie au déploiement suivant. Si la
-- consignation supprimait ce qu'elle ne retrouve plus, elle bénirait la disparition à
-- l'instant même où il faut la signaler, et ce fichier n'aurait servi à rien.
--
-- ELLE NE CONSIGNE QUE LES CONFORMES. Une fonction qui porte le nom sans les propriétés
-- n'est pas jouée (§20.1) : l'inscrire au registre reviendrait à promettre de veiller sur
-- une greffe.
--
-- QUAND L'APPELER : en fin de TOUTE migration, juste avant le bloc de vérification (voir
-- §10). db/migrate.mjs l'appelle en plus après une application réussie — hors de la
-- transaction « read only » du garde-fou —, de sorte qu'une migration qui oublierait de
-- l'appeler soit rattrapée. Jamais sous « --verifier », qui promet de n'écrire nulle part.
-- =====================================================================================

create or replace function f_consigner_controles_schema()
returns table (garde_fou text, mouvement text)
    language plpgsql volatile
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    for r in
        select d.fonction as nom, d.signature as sig
          from f_decouvrir_controles_schema() d
         where d.conforme
         order by d.fonction
    loop
        update controles_schema
           set signature = r.sig
         where controles_schema.fonction = r.nom
           and controles_schema.signature is distinct from r.sig;

        if found then
            garde_fou := r.nom;
            mouvement := 'signature_actualisee';
            return next;
            continue;
        end if;

        if not exists (select 1 from controles_schema c where c.fonction = r.nom) then
            insert into controles_schema (fonction, signature)
                 values (r.nom, r.sig)
            on conflict (fonction) do nothing;
            garde_fou := r.nom;
            mouvement := 'consigne';
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_consigner_controles_schema() is
    'Consigne dans controles_schema la liste des garde-fous CONFORMES actuellement '
    'découverts. N''ajoute et n''actualise ; NE SUPPRIME JAMAIS — une ligne restée seule est '
    'précisément ce qui signale une disparition au déploiement suivant (constat Q-5). Rend '
    'une ligne par MOUVEMENT (« consigne », « signature_actualisee ») : rien à dire quand '
    'rien n''a changé. À appeler en fin de TOUTE migration, avant la vérification, et par '
    'db/migrate.mjs après une application réussie — jamais dans une transaction « read '
    'only », jamais sous « --verifier ». Écrit sous le compte propriétaire : le rôle '
    'applicatif n''a que « select » sur le registre.';

-- =====================================================================================
-- §5 — LE RETRAIT EXPLICITE D'UN CONTRÔLE
-- -------------------------------------------------------------------------------------
-- Retirer un garde-fou reste LÉGITIME : un contrôle peut être remplacé, fusionné dans un
-- autre, ou devenir sans objet. Ce qui ne doit pas rester possible, c'est de le retirer
-- SANS QUE PERSONNE LE VOIE. Le geste passe donc par une instruction nommée, dans une
-- migration — c'est-à-dire dans un fichier relu, daté, conservé et empreint (§23).
--
-- Deux refus, et chacun a son motif :
--   - un motif vide : ce qui n'est pas écrit ne se relit pas dans six mois ;
--   - un contrôle ENCORE DÉCOUVERT : l'appelant croit retirer un garde-fou alors qu'il
--     vide une ligne que la prochaine consignation réécrira. C'est l'erreur honnête —
--     « j'ai retiré l'entrée, j'ai oublié de supprimer la fonction » — et elle est refusée
--     plutôt qu'ignorée.
--
-- La trace du retrait n'est pas en base, et c'est délibéré : une ligne de tombe dans le
-- registre serait une seconde liste à tenir. La trace, c'est la MIGRATION.
-- =====================================================================================

create or replace function f_retirer_controle_schema(p_fonction text, p_motif text)
returns text
    language plpgsql volatile
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if coalesce(btrim(p_motif), '') = '' then
        raise exception 'Retrait d''un garde-fou sans motif : refusé.'
            using errcode = '22023',
                  hint = 'select f_retirer_controle_schema(''f_verifier_<x>'', ''pourquoi ce '
                         'contrôle n''''a plus lieu d''''être'');';
    end if;

    if exists (select 1 from f_decouvrir_controles_schema() d where d.fonction = p_fonction) then
        raise exception
            'Le contrôle « % » est TOUJOURS découvert dans le schéma : son entrée au registre '
            'serait réécrite à la prochaine consignation.', p_fonction
            using errcode = '22023',
                  hint = 'Supprimez ou renommez d''abord la fonction, puis retirez son entrée — '
                         'dans cet ordre, et dans la même migration.';
    end if;

    delete from controles_schema where fonction = p_fonction;

    if not found then
        raise exception 'Aucun garde-fou « % » au registre : rien à retirer.', p_fonction
            using errcode = '22023',
                  hint = 'select fonction from controles_schema order by 1;';
    end if;

    raise notice 'Garde-fou « % » retiré du registre — motif : %', p_fonction, p_motif;
    return format('garde-fou « %s » retiré du registre — motif : %s', p_fonction, p_motif);
end;
$$;

comment on function f_retirer_controle_schema(text, text) is
    'Retire du registre l''entrée d''un garde-fou SUPPRIMÉ — le seul chemin légitime pour '
    'faire taire l''anomalie « controle_disparu » (constat Q-5). Refuse un motif vide, et '
    'refuse de retirer un contrôle encore découvert : dans ce cas l''appelant croit retirer '
    'un garde-fou alors qu''il vide une ligne que la consignation réécrira. À écrire dans '
    'la migration qui supprime la fonction, jamais à la main sur une base : la migration '
    'est la trace.';

-- =====================================================================================
-- §6 — LE POINT D'APPEL UNIQUE, RÉÉMIS
-- -------------------------------------------------------------------------------------
-- Trois différences avec la version de 001, et rien d'autre :
--   1. la découverte est déléguée à f_decouvrir_controles_schema() (§3) — même prédicat,
--      même convention, une seule copie ;
--   2. les noms découverts sont retenus, puis COMPARÉS à la dernière observation ;
--   3. l'absence du registre, son vide, la disparition et la re-signature d'un contrôle
--      deviennent des anomalies du contrôle « point_appel ».
--
-- CE QUI NE CHANGE PAS, et qui compte : la fonction reste « security definer » — un
-- ABAISSEMENT de privilège, puisque le seul appelant qui détienne plus que le propriétaire
-- est deploy/install.sh, joué sous « su postgres » (§20.1) ; elle reste non volatile, donc
-- PostgreSQL lui refuse toute écriture ; ses quatre colonnes de résultat l'excluent
-- d'elle-même de la découverte — pas de récursion. Et elle ne CONSIGNE rien : ses deux
-- appelants la jouent en transaction « read only ».
--
-- POURQUOI LE ZÉRO ABSOLU COURT-CIRCUITE LA COMPARAISON. Quand plus rien n'est découvert,
-- l'anomalie « aucun_controle_decouvert » dit déjà tout, et l'énumération des huit
-- disparitions n'apprendrait rien de plus qu'elle ne noierait. Le silence, lui, reste
-- impossible dans les deux cas.
-- =====================================================================================

create or replace function f_verifier_schema()
returns table (controle text, objet text, anomalie text, detail text)
    language plpgsql stable
    security definer
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_joues      integer := 0;
    v_decouverts text[]  := array[]::text[];
    r            record;
begin
    for r in select * from f_decouvrir_controles_schema() loop
        -- Retenu qu'il soit joué ou non : une fonction qui porte le nom sans les
        -- propriétés est DÉJÀ une anomalie nommée ; la compter aussi comme disparue
        -- ajouterait du bruit à un défaut déjà signalé.
        v_decouverts := v_decouverts || r.fonction;

        -- On ne joue pas ce qu'on ne reconnaît pas. Le refus est BRUYANT : la fonction
        -- devient une anomalie, donc un échec de déploiement, au lieu d'un exécutant.
        if not r.conforme then
            controle := 'point_appel';
            objet    := r.fonction;
            anomalie := 'controle_non_conforme';
            detail   := format(
                'une fonction porte le nom d''un garde-fou de schéma sans en avoir les '
                'propriétés — elle n''est PAS jouée (CONVENTIONS.md §19.4, constat Q5-1) : %s',
                r.proprietes);
            return next;
            continue;
        end if;

        v_joues := v_joues + 1;
        return query execute format(
            'select %L::text, v.objet, v.anomalie, v.detail from public.%I() v',
            r.controle, r.fonction);
    end loop;

    -- Un point d'appel qui n'appelle plus rien rendrait « aucune anomalie » sur une base
    -- entièrement sabotée. C'est le pire des résultats possibles : il rassure.
    if v_joues = 0 then
        controle := 'point_appel';
        objet    := 'f_verifier_schema';
        anomalie := 'aucun_controle_decouvert';
        detail   := 'aucune fonction « f_verifier_<x>() » sans argument rendant '
                    '(objet, anomalie, detail) n''existe dans le schéma public : le point '
                    'd''appel unique ne joue plus aucun contrôle et son silence ne vaut rien';
        return next;
        return;
    end if;

    -- ── IL DIT AUSSI QUAND IL EN TROUVE MOINS (constat Q-5) ─────────────────────────
    --
    -- Le zéro absolu était rattrapé ; la disparition d'UN contrôle sur huit ne l'était
    -- pas. Sept garde-fous tournaient, le huitième avait été renommé ou re-signé par une
    -- migration ordinaire, et le déploiement annonçait « aucune anomalie » sur une base
    -- dont la Row Level Security était tombée.
    if to_regclass('public.controles_schema') is null then
        controle := 'point_appel';
        objet    := 'controles_schema';
        anomalie := 'registre_absent';
        detail   := 'le registre des garde-fous observés n''existe plus : la disparition d''un '
                    'contrôle redeviendrait silencieuse (constat Q-5). Il est créé par '
                    'db/migrations/005_controles_schema.sql';
        return next;
        return;
    end if;

    if not exists (select 1 from controles_schema) then
        controle := 'point_appel';
        objet    := 'controles_schema';
        anomalie := 'registre_vide';
        detail   := format(
            'le registre des garde-fous est VIDE alors que %s contrôle(s) sont joués : rien '
            'n''y a jamais été consigné, ou il a été vidé. Une disparition de contrôle '
            'passerait alors inaperçue, puisqu''il n''y aurait rien à quoi la comparer. '
            'Consigner l''état courant : select f_consigner_controles_schema();', v_joues);
        return next;
        return;
    end if;

    for r in
        select cs.fonction,
               cs.signature,
               cs.cree_le,
               (select string_agg(
                           format('%s(%s) returns %s', p.proname::text,
                                  pg_get_function_identity_arguments(p.oid),
                                  pg_get_function_result(p.oid)),
                           ' ; ' order by p.pronargs)
                  from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname::text = cs.fonction) as signature_courante
          from controles_schema cs
         where not (cs.fonction = any (v_decouverts))
         order by cs.fonction
    loop
        controle := 'point_appel';
        objet    := r.fonction;

        if r.signature_courante is null then
            anomalie := 'controle_disparu';
            detail   := format(
                'ce garde-fou figurait à la dernière observation du schéma (consigné le %s '
                'sous « %s ») et AUCUNE fonction de ce nom n''existe plus : il n''est plus '
                'joué, et le silence du point d''appel ne prouve plus rien (constat Q-5). Si '
                'le retrait est VOULU, il se déclare, dans la migration qui supprime la '
                'fonction : select f_retirer_controle_schema(%L, ''motif du retrait'');',
                to_char(r.cree_le, 'YYYY-MM-DD HH24:MI'), r.signature, r.fonction);
        else
            anomalie := 'controle_resigne';
            detail   := format(
                'ce garde-fou figurait à la dernière observation du schéma et la découverte ne '
                'le reconnaît plus, alors qu''une fonction de ce nom existe toujours : la '
                'convention d''écriture exige ZÉRO ARGUMENT et le type de retour exact '
                '(objet text, anomalie text, detail text). Un argument ajouté, un type de '
                'retour élargi, et le contrôle sort du point d''appel sans que rien d''autre '
                'ne casse — c''est le second scénario du constat Q-5. Consigné : « %s ». '
                'Trouvé : « %s ».',
                r.signature, r.signature_courante);
        end if;

        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_schema() is
    'Point d''appel UNIQUE des vérifications automatiques du schéma (CONVENTIONS.md §18.4 et '
    '§19.4). IL DÉCOUVRE ses contrôles dans le catalogue au lieu de les énumérer '
    '(f_decouvrir_controles_schema) : toute fonction « public.f_verifier_<x>() », sans '
    'argument, rendant (objet, anomalie, detail), appartenant au propriétaire de la base, '
    'sans « security definer », non volatile et au chemin de recherche figé, est jouée — et '
    'un garde-fou neuf qui respecte cette convention est donc branché sur le déploiement ET '
    'sur la recette sans qu''aucun fichier change. Une fonction qui porte le nom sans les '
    'propriétés n''est PAS jouée : elle devient l''anomalie « controle_non_conforme » '
    '(constat Q5-1). '
    'IL COMPARE ce qu''il découvre à la dernière observation consignée dans '
    'controles_schema : un contrôle consigné et non retrouvé est une anomalie — '
    '« controle_disparu » s''il n''existe plus, « controle_resigne » s''il existe sous une '
    'autre signature (constat Q-5). Les contrôles neufs s''ajoutent librement ; seule leur '
    'disparition est refusée. '
    'IL REFUSE, enfin, de ne rien découvrir du tout (« aucun_controle_decouvert »), un '
    'registre absent ou vide — un point d''appel qui ne compare plus rien rassure sans rien '
    'garantir. '
    '« SECURITY DEFINER » EST ICI UN ABAISSEMENT DE PRIVILÈGE, pas une élévation : le seul '
    'appelant qui détienne plus que le propriétaire est deploy/install.sh, qui joue son SQL '
    'sous « su postgres » — sans cela, une fonction découverte s''exécuterait avec les droits '
    'du superutilisateur du cluster et sortirait de PostgreSQL. '
    'Il NE CONSIGNE RIEN : ses appelants le jouent en transaction « read only » ; '
    'l''observation s''écrit quand une MIGRATION s''applique '
    '(f_consigner_controles_schema). '
    'PORTÉE EXACTE, À NE PAS SURESTIMER (§17.5) : il compare des PRÉSENCES, pas des corps. '
    'Un contrôle vidé de sa substance reste découvert, reste joué et ne remonte rien ; ce '
    'qui mord là, ce sont les tests de comportement. '
    'Un schéma sain ne renvoie AUCUNE ligne. À appeler en fin de TOUTE migration, et à faire '
    'échouer le déploiement sur la moindre ligne rendue.';

-- Le droit d'exécution d'une fonction « security definer » ne se laisse pas à PUBLIC.
-- « create or replace » CONSERVE les privilèges existants : les « grant » posés par 001
-- restent en place et ne sont pas répétés. Les deux fonctions d'ÉCRITURE, elles, sont
-- neuves — et n'ont aucune raison d'être exécutables par un rôle de connexion. Elles sont
-- « security invoker » : un grc_app qui les appellerait échouerait de toute façon sur les
-- privilèges de la table ; le retrait ferme la porte un cran plus tôt, et il dit ce qu'on
-- veut dire.
revoke execute on function f_consigner_controles_schema() from public;
revoke execute on function f_retirer_controle_schema(text, text) from public;

-- =====================================================================================
-- §7 — f_verifier_couverture_rls() RÉÉMISE : UNE EXEMPTION DE PLUS
-- -------------------------------------------------------------------------------------
-- Le garde-fou de couverture exige de TOUTE table du schéma public la RLS active et
-- forcée, une politique de lecture et une d'écriture — et, sauf exemption nommée, des
-- prédicats qui consultent le périmètre de la session. controles_schema est un registre
-- technique de niveau socle : lui faire porter un prédicat de filiale n'aurait aucun
-- sens, et lui faire NOMMER une fonction de périmètre pour passer le contrôle sans s'en
-- servir serait exactement l'angle mort que le §17.5 décrit — un garde-fou berné en
-- connaissance de cause, ce qui est pire que pas de garde-fou.
--
-- La liste des exemptions est donc allongée d'un nom, à l'endroit prévu pour cela, et la
-- fonction est REPOSÉE ENTIÈRE : une migration appliquée ne se réécrit pas, elle se
-- corrige dans la suivante par « create or replace » (CONVENTIONS.md §23). Le corps
-- ci-dessous est celui de 004_rls.sql, RECOPIÉ SANS AUCUNE AUTRE MODIFICATION — la seule
-- différence est encadrée d'un commentaire qui le dit. Le §19.5 admet une liste écrite à
-- la main à la condition que le garde-fou vérifie qu'elle reste juste : c'est ce que fait
-- déjà sa boucle « exemption_obsolete », et elle couvre le nom ajouté sans rien changer.
-- =====================================================================================

create or replace function f_verifier_couverture_rls()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- ── LA LISTE EST INVERSÉE DEPUIS LE CONSTAT Q-5 (CONVENTIONS.md §19.5) ───────────
    --
    -- Elle énumérait « les six tables de liaison sans filiale_id » qui devaient être
    -- cloisonnées par leur seule politique. Il y en avait SEPT : import_erreurs manquait
    -- à l'appel, et échappait donc entièrement au garde-fou. Rejoué à la porte S1 : sa
    -- politique de lecture ramenée à « using (true) » ne remontait AUCUNE anomalie, sur
    -- une table dont la migration 003 dit elle-même qu'« une ligne d'erreur cite le
    -- contenu du fichier importé, c'est donc de la donnée de filiale » — un import de
    -- l'annuaire des personnes ou du registre RGPD y dépose des noms verbatim.
    --
    -- C'était la troisième fois qu'une liste écrite à la main produisait un défaut. Le
    -- sens de lecture est donc renversé : le garde-fou DÉCOUVRE dans le catalogue les
    -- tables qui ne portent pas de filiale_id, et EXIGE de chacune un prédicat
    -- cloisonnant, SAUF si elle figure nommément ci-dessous. Une table future oubliée est
    -- désormais réclamée bruyamment au lieu d'être exemptée en silence : le défaut par
    -- défaut est fermé, plus ouvert.
    --
    -- Les tables sans filiale_id dont l'absence de cloisonnement est LÉGITIME et motivée.
    -- Elles sont de niveau Groupe, ou lues avant que le périmètre existe (§6).
    v_sans_filiale_admises constant text[] := array[
        -- ── AJOUTÉE PAR 005_controles_schema.sql, ET C'EST LA SEULE DIFFÉRENCE ─────
        -- avec la version posée par 004 (le reste de cette fonction est recopié
        -- verbatim : une migration appliquée ne se réécrit pas, elle se corrige dans
        -- la suivante — CONVENTIONS.md §23).
        --
        -- controles_schema est un REGISTRE TECHNIQUE, de même nature que
        -- migrations_schema : il garde la dernière observation des garde-fous du
        -- schéma. Il ne contient aucune donnée de filiale — un nom de fonction et sa
        -- signature — et il est lu par f_verifier_schema() AVANT que le périmètre
        -- existe, à chaque migration et à chaque installation. Son écriture n'est pas
        -- tenue par une politique mais par les PRIVILÈGES : le rôle applicatif n'a que
        -- « select » dessus (§2 de cette migration), et f_verifier_privileges() le
        -- vérifie désormais à chaque déploiement.
        'controles_schema',
        'filiales',           -- définit la frontière elle-même ; lue avant tout périmètre
        'utilisateurs',       -- identités ; lues pour RÉSOUDRE le périmètre
        'profils',            -- définition des profils métier (niveau Groupe)
        'profil_domaines',    -- droits d'un profil par domaine (niveau Groupe)
        'migrations_schema',  -- registre technique ; écriture fermée par les privilèges
        'sessions',           -- produit le périmètre ; fermeture reportée au lot L3
        'session_domaines',   -- idem ; report L3 écrit au §6
        'mappings',           -- catalogue de correspondances, niveau Groupe (§16.4)
        -- mapping_exigences : n'est PAS cloisonnable, et la traiter comme les six
        -- liaisons serait une erreur de fait. Son parent (mappings) est de niveau GROUPE,
        -- et son autre extrémité est le couple (ref_id, code) du catalogue statique de
        -- référentiels, qui n'est pas en base. Aucune de ses deux extrémités n'appartient
        -- à une filiale : elle ne peut, par construction, porter aucun lien
        -- inter-filiales. Dérogée EN CONNAISSANCE DE CAUSE — la dérogation ne porte que
        -- sur la LECTURE ; son écriture est réservée à l'administration Groupe depuis le
        -- constat M-4 de la porte S2, et c'est arbitré par écrit au §6.
        'mapping_exigences'
    ];

    -- Dérogations documentées à l'exigence « prédicat non trivial » pour des tables qui
    -- PORTENT, elles, un filiale_id (voir §6). Toute AUTRE table porteuse d'un filiale_id
    -- dont la politique dirait « true » fait échouer la vérification : c'est ce qui
    -- interdit à une migration future d'ouvrir une table en grand par inadvertance.
    v_derogations constant text[] := array[
        'groupes_ad',       -- aiguillage de l'authentification, lu AVANT tout périmètre
        'journal_audit',    -- chaînage : la numérotation exige de voir la chaîne entière
        'session_filiales'  -- c'est la table qui PRODUIT le périmètre ; le filtrer par
                            -- lui-même rendrait toute connexion impossible
    ];
    v_nom text;
    r record;
begin
    for r in
        select c.oid,
               c.relname::text                                             as nom,
               c.relrowsecurity                                            as rls,
               c.relforcerowsecurity                                       as forcee,
               exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'filiale_id'
                          and a.attnum > 0 and not a.attisdropped)         as porte_filiale
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         -- « r » ET « p » : le commentaire de cette fonction dit « TOUTE table du schéma
         -- public », et le §0 de ce fichier pense déjà à relkind in ('r','p','v','m') pour
         -- le contrôle de propriété. Une table partitionnée échappait ici au balayage —
         -- constat T-11 du troisième passage. Il n'y en a aucune aujourd'hui ; le filet ne
         -- doit pas attendre la première.
         where n.nspname = 'public' and c.relkind in ('r', 'p')
         order by c.relname
    loop
        objet := r.nom;

        if not r.rls then
            anomalie := 'rls_desactivee';
            detail   := 'la table n''a pas « enable row level security » : ses lignes sont '
                        'visibles de toutes les filiales';
            return next;
        end if;

        if not r.forcee then
            anomalie := 'force_absente';
            detail   := 'la table n''a pas « force row level security » : le propriétaire des '
                        'tables échappe aux politiques';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*'))
        then
            anomalie := 'politique_lecture_absente';
            detail   := 'aucune politique permissive de lecture : la table est illisible, ou le '
                        'sera dès qu''une politique d''écriture existera';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*'))
        then
            anomalie := 'politique_ecriture_absente';
            detail   := 'aucune politique permissive d''écriture : toute écriture est refusée '
                        'sans que rien ne le dise';
            return next;
        end if;

        -- Une politique de lecture ne doit JAMAIS dépendre d'un réglage d'administration :
        -- ce serait un moyen, pour un réglage de session, d'élargir la LECTURE.
        if exists (
            select 1 from pg_policy p
             where p.polrelid = r.oid and p.polcmd in ('r', '*')
               and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%f_administration_groupe%')
        then
            anomalie := 'drapeau_administration_en_lecture';
            detail   := 'une politique de lecture mentionne f_administration_groupe() : un '
                        'réglage de session élargirait la LECTURE, ce que le §2 interdit';
            return next;
        end if;

        -- Politiques qui ne CONSULTENT PAS le périmètre, sur une table qui porte, elle,
        -- une filiale. La détection ne compare plus le prédicat au littéral « true » : elle
        -- exige qu'il MENTIONNE la fonction de périmètre correspondante. Voir la portée
        -- exacte, et ses limites, dans le commentaire de la fonction.
        -- Une table est SOUMISE au cloisonnement si elle porte un filiale_id, ou si elle
        -- n'en porte pas SANS figurer dans la liste des exemptions motivées. Le second
        -- membre est la découverte : ce n'est plus une liste de tables à couvrir, c'est
        -- une liste de tables à NE PAS couvrir, et tout le reste l'est d'office.
        if (r.porte_filiale or not (r.nom = any (v_sans_filiale_admises)))
           and not (r.nom = any (v_derogations)) then
            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*')
                   and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true')
                       !~ '(f_filiales_lecture|f_filiales_autorisees)')
            then
                anomalie := 'lecture_non_cloisonnee';
                detail   := 'une politique de lecture ne consulte pas le périmètre de la session '
                            '(ni f_filiales_lecture, ni f_filiales_autorisees) sur une table '
                            'cloisonnée : toutes les filiales se lisent entre elles. Si la table '
                            'ne porte pas de filiale_id et relève réellement du niveau Groupe, '
                            'elle doit être DÉCLARÉE dans v_sans_filiale_admises, avec son motif';
                return next;
            end if;

            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*')
                   and coalesce(
                           case p.polcmd
                               when 'a' then pg_get_expr(p.polwithcheck, p.polrelid)
                               when 'd' then pg_get_expr(p.polqual, p.polrelid)
                               else coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                                             pg_get_expr(p.polqual, p.polrelid))
                           end, 'true') !~ 'f_filiale_ecriture')
            then
                anomalie := 'ecriture_non_cloisonnee';
                detail   := 'une politique d''écriture ne consulte pas la filiale ACTIVE '
                            '(f_filiale_ecriture) sur une table cloisonnée : une filiale peut '
                            'écrire chez une autre. Si la table ne porte pas de filiale_id et '
                            'relève réellement du niveau Groupe, elle doit être DÉCLARÉE dans '
                            'v_sans_filiale_admises, avec son motif';
                return next;
            end if;
        end if;
    end loop;

    -- Les deux listes écrites à la main ne désignent que des EXEMPTIONS ; le §19.5
    -- n'admet une liste écrite que si le garde-fou vérifie qu'elle reste juste. Une
    -- exemption qui ne désigne plus rien — table supprimée, table renommée — dispenserait
    -- silencieusement de cloisonnement la prochaine table qui reprendrait ce nom.
    foreach v_nom in array v_sans_filiale_admises || v_derogations loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'exemption_obsolete';
            detail   := 'table dispensée de cloisonnement par f_verifier_couverture_rls(), '
                        'mais introuvable dans le schéma : la dérogation ne porte plus sur '
                        'rien et couvrirait toute table future qui reprendrait ce nom';
            return next;
        end if;
    end loop;

    return;
end;
$$;

-- =====================================================================================
-- §8 — f_verifier_privileges() RÉÉMISE : LES REGISTRES TECHNIQUES RESTENT FERMÉS
-- -------------------------------------------------------------------------------------
-- Le §2 a fermé l'écriture du registre et l'a constaté. Un constat de migration ne se
-- rejoue pourtant pas : sur une base à jour, les migrations ne sont PAS rejouées — c'est
-- le constat T-4, et c'est la raison d'être du point d'appel unique (§18.4). Un « grant
-- insert on controles_schema to grc_app » posé un jour par commodité rouvrirait donc la
-- porte sans que rien ne le voie, et le registre cesserait d'être une alarme : le service
-- pourrait supprimer une entrée avant qu'elle ne se plaigne.
--
-- Le contrôle est donc porté par la BASE, dans le garde-fou qui lit déjà le catalogue des
-- privilèges, et il couvre du même geste migrations_schema — dont la fermeture ne tenait
-- jusqu'ici qu'à une vérification de deploy/install.sh, c'est-à-dire à un seul des chemins
-- et à un seul rôle. Aucun garde-fou NEUF n'est créé : un neuvième contrôle aurait été le
-- bon réflexe, mais celui-ci a exactement l'objet de f_verifier_privileges() — « ce que le
-- catalogue des PRIVILÈGES dit » — et l'ajouter là où il appartient vaut mieux que de
-- multiplier les fonctions.
--
-- Le corps ci-dessous est celui de 001_socle.sql, RECOPIÉ SANS AUCUNE AUTRE MODIFICATION
-- que le tableau v_registres et le paragraphe 4, tous deux encadrés d'un commentaire qui
-- le dit (CONVENTIONS.md §23).
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
        detail   := format('le rôle porte : %s. BYPASSRLS suffit à rendre tout le cloisonnement '
                           'décoratif, et grc_lecture détient « select » sur les 47 tables. '
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
-- §9 — CONSTAT Q-6 (b) : DEUX COMMENTAIRES RENDUS FAUX PAR LE CORRECTIF T-4
-- -------------------------------------------------------------------------------------
-- Le correctif T-4 de la vague 2 a retiré l'usage du jeton d'idempotence des imports.
-- Deux commentaires de 001_socle.sql décrivent depuis un mécanisme que le seul écrivain
-- de la table n'emploie plus. Ils sont corrigés ICI, par « comment on », et non là-bas :
-- 001 est une migration APPLIQUÉE, db/migrate.mjs en retient l'empreinte SHA-256 et sort
-- en code 4 si le fichier bouge (CONVENTIONS.md §23). L'objection « ce n'est qu'un
-- commentaire, rien n'est déployé » est matériellement exacte et refusée : c'est le
-- raisonnement qui vide une règle de sa substance la première fois qu'elle coûte quelque
-- chose.
--
-- CE QUE FAIT LE CODE AUJOURD'HUI, vérifié dans src/api/index.ts et non déduit du nom des
-- objets : la table « imports » n'a qu'un seul écrivain, la route de reprise d'un export
-- grc-backup. Elle nomme ses colonnes, écrit « statut = 'applique' », « entite = 'toutes' »,
-- « source = 'grc-backup' », l'empreinte du fichier dans « sha256 » — et LAISSE
-- « cle_idempotence » À NULL. L'index partiel ne voit donc jamais aucune ligne (son
-- « where … and cle_idempotence is not null » n'est jamais satisfait) et ne refuse rien.
--
-- Le fichier 001 garde ses deux commentaires faux — c'est le corollaire du §23, et il est
-- assumé : un commentaire faux dans une migration appliquée reste faux le temps qu'une
-- migration suivante existe. Le catalogue, lui, dit vrai à partir d'ici, et c'est le
-- catalogue que lit un auditeur.
-- =====================================================================================

comment on index uq_imports_idempotence is
    'Unicité PARTIELLE, aujourd''hui SANS EFFET, et conservée pour le lot L7 (constat Q-6 b). '
    'Le seul écrivain de « imports » — la reprise d''un export grc-backup, src/api/index.ts — '
    'laisse « cle_idempotence » à NULL : la condition « cle_idempotence is not null » n''est '
    'jamais satisfaite, l''index ne voit aucune ligne et ne refuse rien. '
    'POURQUOI : le correctif T-4 de la vague 2 a retiré l''usage du jeton. Renseigner la clé '
    'avec l''empreinte du contenu en faisait un JETON À USAGE UNIQUE — un fichier donné ne '
    'pouvait être appliqué à une filiale qu''une fois, pour toujours, quel que soit le mode — '
    'ce qui interdisait trois gestes ordinaires : fusionner pour voir puis remplacer, '
    'restaurer DEUX FOIS la même sauvegarde (le geste même de la reprise après incident, dans '
    'un produit qui héberge le PCA du groupe), et reprendre un fichier déjà essayé. '
    'L''index reste en place pour le lot L7, où l''idempotence sera portée par la REQUÊTE — '
    'une clé fournie par l''appelant — et non par le fichier.';

comment on column imports.cle_idempotence is
    'Clé d''idempotence d''un import. NON RENSEIGNÉE aujourd''hui : le seul écrivain de cette '
    'table (la reprise d''un export grc-backup, src/api/index.ts) la laisse à NULL depuis le '
    'correctif T-4 de la vague 2, et l''index partiel uq_imports_idempotence ne refuse donc '
    'rien (constat Q-6 b). L''empreinte du FICHIER, elle, continue d''être écrite dans '
    '« sha256 » : la trace dit toujours QUEL fichier a été appliqué — c''est le jeton '
    'd''unicité qui a disparu, pas la traçabilité. '
    'Destinée au lot L7, qui portera l''idempotence sur la REQUÊTE (clé fournie par '
    'l''appelant, sens usuel de « rejouer la même requête ne double pas l''effet ») et non '
    'sur le contenu du fichier — la reprise, elle, est déjà idempotente par construction : '
    'elle met à jour ce qu''elle retrouve, et converge.';

-- =====================================================================================
-- §10 — TRAÇABILITÉ D'INSERTION, ARMEMENT, CONSIGNATION, PUIS VÉRIFICATION
-- -------------------------------------------------------------------------------------
-- Les deux instructions qui closent les quatre migrations précédentes (CONVENTIONS.md
-- §18.1 et §18.4), et une TROISIÈME qui les précède désormais :
--
--   1. poser les déclencheurs « before insert » sur les tables créées par ce fichier, et
--      armer en « always » tout déclencheur qui ne le serait pas ;
--   2. CONSIGNER l'observation des garde-fous — c'est ici, et nulle part ailleurs, que le
--      registre s'écrit : la vérification qui suit est jouée par le déploiement dans une
--      transaction « read only » et ne peut pas écrire ;
--   3. faire échouer la migration si la vérification rend la moindre ligne.
--
-- L'ORDRE EST LE MÉCANISME, pas une commodité. Consigner AVANT de vérifier inscrit les
-- contrôles neufs (qui doivent l'être : c'est le §19.4) et LAISSE INTACTES les lignes des
-- contrôles disparus — puisque la consignation ne supprime jamais. Une migration qui
-- retirerait un garde-fou sans le déclarer échoue donc sur sa propre vérification finale,
-- au lieu de bénir sa disparition.
--
-- TOUTE MIGRATION FUTURE RECOPIE CES TROIS BLOCS. Celle qui les oublierait échouerait au
-- déploiement sur le troisième — et db/migrate.mjs rattrape le second après une
-- application réussie, pour que l'oubli ne laisse pas le registre en arrière.
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
                  hint = 'controle_disparu / controle_resigne : un garde-fou consigné n''est '
                         'plus découvert. S''il a été retiré à dessein, déclarez-le : '
                         'select f_retirer_controle_schema(''f_verifier_<x>'', ''motif''); '
                         'Voir backend/db/CONVENTIONS.md §18.4, §19.4 et le §6 de cette migration.';
    end if;

    raise notice 'Schéma vérifié : % garde-fou(x) consigné(s), % joué(s).',
                 (select count(*) from controles_schema),
                 (select count(*) from f_decouvrir_controles_schema() where conforme);
end;
$$;

-- =====================================================================================
-- §11 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('005', 'Registre des garde-fous de schéma : un contrôle qui cesse d''être découvert '
               'ne s''efface plus en silence (constat Q-5) ; correction par « comment on » '
               'des deux commentaires rendus faux par le correctif T-4 (constat Q-6 b)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Rejouer ce bloc REND SILENCIEUSE la disparition d'un garde-fou : f_verifier_schema()
-- retrouve l'angle mort du constat Q-5. Les versions de 001 et 004 des trois fonctions
-- réémises doivent être reposées à la main — « create or replace » ne garde pas
-- l'ancienne. À n'exécuter qu'en développement.
--
-- begin;
--   drop function if exists f_retirer_controle_schema(text, text);
--   drop function if exists f_consigner_controles_schema();
--   drop table if exists controles_schema;
--   -- f_verifier_schema() référence encore f_decouvrir_controles_schema() : reposez
--   -- d'abord la version de 001_socle.sql, puis seulement :
--   -- drop function if exists f_decouvrir_controles_schema();
--   -- Les commentaires du §9 ne sont pas « annulables » : les rétablir faux n'aurait
--   -- aucun sens. Ils décrivent le code, qui n'a pas changé.
--   delete from migrations_schema where version = '005';
-- commit;
-- =====================================================================================
