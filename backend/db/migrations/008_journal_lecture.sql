-- =====================================================================================
-- 008_journal_lecture.sql — La lecture du journal d'audit se resserre sur le périmètre
-- =====================================================================================
-- Lot **L5** (journal d'audit). Ce fichier ferme la **condition d'entrée E6** du
-- `backend/db/CONVENTIONS.md` §22, et applique l'arbitrage du **§29.7**, qui fait foi.
--
-- Références : `CONVENTIONS.md` §12 (ajout seul en quatre couches, chaînage, vérification),
-- §17.2 (une fonction fige son chemin de recherche), §18.4 et §19.4 (un garde-fou se
-- branche sur le point d'appel unique, jamais sur une liste), §22 (condition E6), §23 (une
-- migration appliquée ne se réécrit pas), §29.7 et §29.8 (le contrat de L5) ;
-- `004_rls.sql` §6, qui écrit déjà la correction à faire ; `PLAN_SERVEUR` §1.7.
--
-- Dépendances : 001 à 007. Contenu :
--   §0  Gardes
--   §1  f_est_proprietaire_base() et f_perimetre_groupe() — de quoi écrire la politique
--   §2  f_journal_audit_chainage() devient « security definer »
--   §3  f_journal_audit_verifier() devient « security definer »
--   §4  Propriété et droit d'exécution des deux fonctions du chaînage
--   §5  E6 : la politique de lecture se resserre
--   §6  Le garde-fou neuf : f_verifier_lecture_journal()
--   §7  Consignation, puis vérification
--   §8  Enregistrement de la migration
--
-- -------------------------------------------------------------------------------------
-- CE QUE CE FICHIER FERME, ET DANS QUEL ORDRE — le piège est là, et nulle part ailleurs
--
-- `004_rls.sql` §6 a posé « create policy pol_journal_audit_lecture … using (true) » avec,
-- en regard, un commentaire de quarante lignes qui explique pourquoi et qui date la
-- correction du lot L5. La justification était juste sur la mécanique et fausse sur le
-- risque : le `backend/README.md` §8 la reportait en écrivant qu'elle était « sans effet
-- tant que le journal est vide ». **La mesure l'a démentie**, le 04/09/2026, sur la base
-- de recette de cette machine :
--
--     $ psql -U grc_lecture -d cyber_grc -c 'select count(*) from journal_audit'
--      160
--
-- `grc_lecture` est le compte de SUPERVISION, en lecture seule, sans périmètre : il ne
-- peut lire aucun risque, aucune action, aucun incident — et il lisait cent soixante
-- entrées de journal, logins et adresses IP compris. C'est le constat qui ferme E6.
--
-- ⚠️ **LES DEUX MOITIÉS N'ONT DE SENS QU'ENSEMBLE, ET L'ORDRE N'EST PAS UN DÉTAIL.**
--
--   · Resserrer SANS « security definer » fait échouer **toute écriture** au journal :
--     f_journal_audit_chainage() numérote à partir de « max(numero) » LU SOUS RLS. Un
--     périmètre de filiale ne verrait qu'une partie de la chaîne, repartirait d'un numéro
--     déjà pris, et chaque insertion mourrait sur uq_journal_audit_numero.
--   · Poser « security definer » SANS resserrer n'améliore rien du tout.
--
-- C'est le motif du 5ᵉ passage de la porte S2 — *deux fichiers dont aucun n'a tort seul* —
-- et c'est pourquoi les deux moitiés vivent dans CE fichier, appliquées par la même
-- transaction. Il n'existe aucun état intermédiaire déployable.
--
-- -------------------------------------------------------------------------------------
-- L'ARBITRAGE, ET SON COÛT — recopié du §29.7 parce qu'il se lit ici, pas ailleurs
--
--   | Entrée                    | Périmètre Groupe | Périmètre d'une filiale |
--   |---------------------------|------------------|-------------------------|
--   | filiale_id = sa filiale   | lit              | LIT                     |
--   | filiale_id = une autre    | lit              | NE LIT PAS              |
--   | filiale_id is null        | lit              | NE LIT PAS              |
--
-- Le troisième cas est l'arbitrage, et son coût s'écrit : un échec de connexion n'est
-- attaché à aucune filiale — il PRÉCÈDE la résolution du périmètre, et sur un login
-- inconnu il n'y a rien à résoudre. Les rendre visibles à chaque filiale donnerait à
-- chacune la liste des logins du groupe entier : c'est l'oracle inter-filiales que ce
-- chantier ferme depuis la vague 1. Le coût assumé est qu'un administrateur de filiale ne
-- voit pas les tentatives visant ses propres utilisateurs ; c'est le RSSI Groupe qui les
-- voit. À reconsidérer si le client le demande — par écrit, pas par glissement.
--
-- -------------------------------------------------------------------------------------
-- CE QUE CE FICHIER NE FERME PAS, ET QU'IL FAUT DIRE (§17.5 : un garde-fou ne se voit pas
-- prêter plus de portée qu'il n'en a)
--
--   · **Le propriétaire de la base lit tout le journal**, et c'est la contrepartie exacte
--     du chaînage : les deux fonctions du socle s'exécutent sous son identité. `004` §1
--     annonçait « un pg_dump lancé sous grc_proprietaire échoue » — cela reste vrai des
--     47 autres tables, et cesse de l'être de celle-ci. Le §12 dit déjà que le journal ne
--     protège pas contre le DBA système ; il ne protégeait déjà pas contre lui.
--   · **La confidentialité applicative reste du ressort du serveur** : le domaine
--     « journal » du modèle de droits, vérifié à chaque requête (§29.8). La RLS répond à
--     « quelles lignes », jamais à « quelle personne a le droit de faire quoi ».
--   · **Un `0` sur une table cloisonnée ne distingue pas vide de non contrôlé**
--     (constat Q-104) : la garde de périmètre est évaluée PAR LIGNE. Sur un journal vide,
--     elle ne s'exerce pas. Tout essai de cette propriété se joue sur une table non vide.
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
      from unnest(array['f_filiales_lecture()', 'f_filiales_autorisees()',
                        'f_journal_audit_chainage()', 'f_journal_audit_verifier(bigint)',
                        'f_journal_audit_charge_utile(bigint,text,timestamptz,text,text,text,'
                        || 'text,inet,text,text,text,text,jsonb,jsonb,text,text)',
                        'f_verifier_schema()', 'f_consigner_controles_schema()',
                        'f_decouvrir_controles_schema()']) as o
     where to_regprocedure('public.' || o) is null;

    if v_manquants is not null then
        raise exception 'Objets attendus introuvables : %. Les migrations 001 à 007 '
                        'doivent être appliquées avant celle-ci.', v_manquants;
    end if;

    if to_regclass('public.journal_audit') is null then
        raise exception 'journal_audit est introuvable : 001_socle.sql n''a pas été appliqué.';
    end if;

    if not exists (select 1 from pg_policy p
                    where p.polrelid = 'journal_audit'::regclass
                      and p.polname = 'pol_journal_audit_lecture') then
        raise exception 'pol_journal_audit_lecture est introuvable : cette migration RESSERRE '
                        'une politique existante (004_rls.sql §6), elle n''en invente pas une.';
    end if;
end;
$$;

-- =====================================================================================
-- §1 — DE QUOI ÉCRIRE LA POLITIQUE : DEUX PRÉDICATS, ET AUCUN N'EST UNE LISTE
-- -------------------------------------------------------------------------------------
-- Le §11 ne connaît que deux réglages de périmètre — « grc.filiales » (lecture) et
-- « grc.filiale_id » (écriture) — et le §29.7 exige une distinction de plus : le
-- périmètre GROUPE, seul à lire les entrées transversales.
--
-- Il n'existe pas de cinquième réglage de session, et en introduire un aurait signifié
-- toucher à src/db/pool.ts, donc au point de passage de TOUTES les transactions du
-- produit. C'est refusé : la propriété se DÉDUIT de ce qui est déjà posé.
--
-- « Périmètre Groupe » se lit exactement, sans rien ajouter, parce que
-- src/droits/resolution.ts le construit ainsi et pas autrement :
--
--     if (porteeGroupe) {
--       select "id" from "filiales" where "statut" = 'active'    -- toutes, sans exception
--     }
--
-- Une session de périmètre Groupe porte donc DANS grc.filiales toutes les filiales
-- actives. La réciproque est ce que f_perimetre_groupe() constate. C'est une DÉDUCTION,
-- pas une convention : elle ne peut pas se désynchroniser de la résolution, puisqu'elle
-- lit le même catalogue qu'elle.
--
-- ⚠️ SON SEUL CAS DÉGÉNÉRÉ, et il est dit : un groupe qui n'aurait QU'UNE filiale active
-- rend toute session « Groupe ». C'est exact plutôt que gênant — il n'y a alors aucune
-- autre filiale à qui cacher quoi que ce soit —, et le produit ne démarre pas sans au
-- moins une filiale active. Le cas ZÉRO filiale active, lui, est fermé explicitement :
-- sans lui, « aucune filiale manquante » vaudrait « toutes présentes », et le prédicat
-- s'ouvrirait en grand sur une base à moitié installée. Un prédicat de cloisonnement ne
-- doit jamais avoir de cas où il rend « vrai » faute de matière.
-- =====================================================================================

create or replace function f_est_proprietaire_base() returns boolean
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select exists (
        select 1
          from pg_database d
          join pg_roles r on r.oid = d.datdba
         where d.datname = current_database()
           and r.rolname = current_user);
$$;

comment on function f_est_proprietaire_base() is
    'La transaction s''exécute-t-elle sous le PROPRIÉTAIRE de la base ? Découvert dans '
    'pg_database.datdba, jamais écrit en dur : le nom du rôle est un réglage de '
    'deploy/install.sh (ROLE_PROPRIETAIRE), et une politique qui le citerait littéralement '
    'deviendrait fausse au premier renommage — silencieusement pour la lecture, bruyamment '
    'pour le chaînage. Employée par la seule politique de lecture de journal_audit, dont '
    'les deux fonctions de chaînage sont « security definer » et s''exécutent donc sous ce '
    'rôle (008_journal_lecture.sql §5). Égalité STRICTE sur current_user, et non '
    'pg_has_role() : un rôle simplement MEMBRE du propriétaire garde son propre '
    'current_user et reste cloisonné ; s''il veut la vue entière, il pose « set role », ce '
    'qui est un geste, pas un héritage.';

create or replace function f_perimetre_groupe() returns boolean
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select exists (select 1 from filiales f where f.statut = 'active')
       and not exists (select 1 from filiales f
                        where f.statut = 'active'
                          and not (f.id = any (f_filiales_lecture())));
$$;

comment on function f_perimetre_groupe() is
    'La session lit-elle le GROUPE ENTIER ? Vrai lorsque son périmètre de lecture couvre '
    'toutes les filiales actives — ce qui est, à la lettre, ce que src/droits/resolution.ts '
    'met dans grc.filiales pour une portée « groupe ». Faux s''il n''existe aucune filiale '
    'active : un prédicat de cloisonnement ne rend jamais « vrai » faute de matière. '
    'Sert au SEUL troisième cas du CONVENTIONS.md §29.7 — les entrées de journal sans '
    'filiale (échec de connexion, démarrage du service), que seul le périmètre Groupe lit. '
    'Elle lève GRC04 par f_filiales_lecture() si la transaction n''a pas déclaré son '
    'périmètre : un défaut de programmation doit être bruyant (004_rls.sql §2).';

-- =====================================================================================
-- §2 — f_journal_audit_chainage() DEVIENT « SECURITY DEFINER »
-- -------------------------------------------------------------------------------------
-- C'EST LA MOITIÉ SANS LAQUELLE LE RESSERREMENT DU §5 CASSE TOUT. Le déclencheur lit
-- « max(numero) » DANS journal_audit ; cette lecture s'exécute sous le rôle appelant, donc
-- sous RLS. Une fois la politique resserrée, une session de filiale ne verrait que sa
-- propre part de la chaîne, repartirait d'un numéro déjà attribué, et TOUTE insertion
-- mourrait sur uq_journal_audit_numero. Ce n'est pas une hypothèse : la morsure de
-- test/journal-lecture/ retire ce « security definer » et constate l'échec.
--
-- « SECURITY DEFINER » EST ICI UNE ÉLÉVATION, et il faut la borner honnêtement — c'est
-- l'inverse du cas de f_verifier_schema(), où c'en est un abaissement :
--   · elle est bornée par ce que la fonction FAIT : lire le dernier maillon, et écraser
--     les colonnes probantes de la ligne insérée. Elle ne rend rien à l'appelant, elle
--     n'exécute aucun texte reçu, elle ne prend aucun argument ;
--   · elle fige son chemin de recherche (§17.2) — sans quoi une table « journal_audit »
--     plantée dans pg_temp par le rôle applicatif serait lue à la place de la vraie, ce
--     qui est exactement l'attaque que test/base/rls.test.mjs rejoue ;
--   · l'ÉCRITURE, elle, reste cloisonnée : c'est la politique d'ajout (004 §6) qui décide,
--     et elle s'évalue sous le rôle APPELANT, pas sous le définisseur. Nul ne peut donc
--     fabriquer une preuve dans le registre d'une filiale où il n'opère pas.
--
-- Le corps ci-dessous est celui de 001_socle.sql, RECOPIÉ VERBATIM : une migration
-- appliquée ne se réécrit pas, elle se corrige dans la suivante par « create or replace »
-- (§23). La seule différence est la ligne « security definer », encadrée d'un commentaire
-- qui le dit — même geste qu'au 005 §7 pour f_verifier_couverture_rls().
-- =====================================================================================

create or replace function f_journal_audit_chainage() returns trigger
    language plpgsql
    -- ── LA SEULE DIFFÉRENCE AVEC 001_socle.sql, ET ELLE EST TOUT L’OBJET DU FICHIER ──
    security definer
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_precedent record;
begin
    perform pg_advisory_xact_lock(4718271936042001);

    select j.numero, j.empreinte
      into v_precedent
      from journal_audit j
     order by j.numero desc
     limit 1;

    new.numero               := coalesce(v_precedent.numero, 0) + 1;
    new.empreinte_precedente := v_precedent.empreinte;   -- null pour l'entrée de genèse
    new.horodatage           := clock_timestamp();

    -- L'ACTEUR VIENT DE LA SESSION, PAS DU CLIENT (CONVENTIONS.md §17.8).
    --
    -- Ajouté au second passage de la porte de sécurité S1 (constat N-5). Le déclencheur
    -- écrasait déjà le numéro, l'horodatage et les empreintes — tout ce qui fait qu'une
    -- entrée ne se forge pas — mais laissait l'identité de l'acteur en saisie libre. La
    -- seule table dont l'objet EST de faire preuve était donc la seule à croire son
    -- appelant sur ce point. Un journal inaltérable dont l'acteur est déclaré par le
    -- client garantit l'intégrité d'une fausse preuve : le mécanisme fonctionne
    -- parfaitement, sur un contenu faux.
    --
    -- La valeur fournie par l'appelant est écrasée SANS CONDITION. Elle est remplacée par
    -- l'identifiant de session lorsqu'il désigne un compte connu, et par null sinon —
    -- « sinon » couvrant les écritures légitimes qui n'ont pas de compte derrière elles :
    -- « systeme » (migrations, timers d'exploitation) et les événements antérieurs à la
    -- résolution de l'identité (échec de connexion sur un compte inconnu). Mettre
    -- l'identifiant tel quel violerait la clé étrangère vers utilisateurs et rendrait ces
    -- écritures impossibles ; le libellé texte, lui, reste renseigné dans tous les cas.
    --
    -- utilisateur_libelle reste FOURNI par l'appelant, et c'est délibéré (§12) : c'est un
    -- confort de lecture qui doit survivre à la disparition du compte. Il n'est plus la
    -- source de l'identité, seulement son affichage.
    -- La résolution se fait sur le LOGIN, pas sur la clé primaire (CONVENTIONS.md §18.3).
    --
    -- Elle joignait « grc.utilisateur » à « utilisateurs.id ». Or ce réglage est documenté
    -- par ce fichier même comme un login (« set local grc.utilisateur = 'jdupont' »), et
    -- c'est lui qui alimente « cree_par » sur les 42 tables — un identifiant technique
    -- « USR-1720000000000-482 » y serait illisible. Tant que les deux coïncident, rien ne
    -- se voit ; le jour où le lot L3 y met un vrai login, TOUTES les entrées basculent en
    -- silence sur la branche « acteur inconnu » : la chaîne reste intacte, les empreintes
    -- restent valides, et la seule identité qui subsiste est celle que le client a fournie
    -- dans utilisateur_libelle. Constat T-3 du troisième passage de la porte S1.
    --
    -- « lower(...) » des deux côtés : c'est la forme de l'unicité posée sur
    -- utilisateurs.identifiant (§6), et un sAMAccountName n'est pas sensible à la casse.
    --
    -- CE QUI RESTE LÉGITIMEMENT NUL, et il faut le savoir en lisant le journal :
    --   - « systeme » : migrations, timers d'exploitation — aucun compte derrière ;
    --   - un échec de connexion sur un login inconnu, qui est précisément l'événement que
    --     le §1.7 du plan veut voir tracé.
    -- Distinguer « pas d'acteur » (légitime) de « acteur non résolu » (défaut de
    -- programmation) exigerait de connaître, ici, la liste des actions antérieures à
    -- l'authentification : c'est une décision du lot L3, pas du schéma. Signalé comme tel.
    new.utilisateur_id := (
        select u.id from utilisateurs u
         where lower(u.identifiant) = lower(f_utilisateur_courant()));

    new.empreinte := encode(sha256(convert_to(
        f_journal_audit_charge_utile(
            new.numero, new.id, new.horodatage, new.filiale_id,
            new.utilisateur_id, new.utilisateur_libelle, new.session_id,
            new.adresse_ip, new.action, new.entite_type, new.entite_id,
            new.resume, new.valeurs_avant, new.valeurs_apres,
            new.version_application, new.empreinte_precedente),
        'UTF8')), 'hex');

    return new;
end;
$$;

-- =====================================================================================
-- §3 — f_journal_audit_verifier() DEVIENT « SECURITY DEFINER »
-- -------------------------------------------------------------------------------------
-- Même raison, autre symptôme. La vérification PARCOURT la chaîne : cloisonnée, elle
-- signalerait un « numero_manquant » et un « chainage_rompu » à chaque trou de périmètre,
-- c'est-à-dire qu'elle deviendrait inutilisable pour l'usage d'audit qui la justifie. Pire
-- qu'inutilisable : elle crierait à la falsification sur un journal parfaitement sain, et
-- l'on apprendrait à ignorer son verdict.
--
-- CE QU'ELLE LAISSE VOIR, ET CE QU'ELLE NE LAISSE PAS VOIR. Elle rend un numéro, un
-- identifiant, un horodatage, un nom d'anomalie et deux empreintes — jamais le CONTENU
-- d'une entrée : ni résumé, ni identité, ni adresse, ni valeurs avant/après. Et sur un
-- journal sain elle ne rend RIEN. Ce qui fuirait au pire est la preuve qu'une entrée a
-- été altérée, ce qui est précisément l'information qu'un audit doit pouvoir obtenir.
--
-- Le droit d'exécution ne reste pas à PUBLIC pour autant (§4 ci-dessous) : une fonction
-- « security definer » ouverte à tout rôle capable de se connecter serait une surface que
-- personne n'a décidé d'ouvrir.
--
-- Corps recopié VERBATIM de 001_socle.sql, à la seule ligne « security definer » près.
-- =====================================================================================

create or replace function f_journal_audit_verifier(p_depuis bigint default null)
returns table (
    numero_entree     bigint,
    id_entree         text,
    horodatage_entree timestamptz,
    anomalie          text,
    detail            text
)
    language plpgsql stable
    -- ── LA SEULE DIFFÉRENCE AVEC 001_socle.sql ─────────────────────────────────────
    security definer
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r                     record;
    v_attendue            text;
    v_precedent_numero    bigint  := null;
    v_precedent_empreinte text    := null;
    v_premier             boolean := true;
begin
    for r in
        select j.*
          from journal_audit j
         where p_depuis is null or j.numero >= p_depuis
         order by j.numero
    loop
        v_attendue := encode(sha256(convert_to(
            f_journal_audit_charge_utile(
                r.numero, r.id, r.horodatage, r.filiale_id,
                r.utilisateur_id, r.utilisateur_libelle, r.session_id,
                r.adresse_ip, r.action, r.entite_type, r.entite_id,
                r.resume, r.valeurs_avant, r.valeurs_apres,
                r.version_application, r.empreinte_precedente),
            'UTF8')), 'hex');

        if v_attendue is distinct from r.empreinte then
            numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
            anomalie := 'empreinte_invalide';
            detail   := 'attendue=' || v_attendue || ' / stockée=' || coalesce(r.empreinte, '(nulle)');
            return next;
        end if;

        if v_premier then
            if r.numero = 1 and r.empreinte_precedente is not null then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'genese_incoherente';
                detail   := 'la première entrée de la chaîne ne doit pas porter d''empreinte précédente';
                return next;
            elsif r.numero <> 1 then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'chaine_tronquee';
                detail   := 'vérification démarrée au numéro ' || r.numero
                            || ' : le maillon précédent est hors périmètre examiné (paramètre '
                            || 'depuis, ou segment archivé — comparer à parametres.journal.ancrage_<annee>)';
                return next;
            end if;
            v_premier := false;
        else
            if r.numero <> v_precedent_numero + 1 then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'numero_manquant';
                detail   := 'numéro attendu ' || (v_precedent_numero + 1)::text
                            || ', trouvé ' || r.numero::text;
                return next;
            end if;
            if r.empreinte_precedente is distinct from v_precedent_empreinte then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'chainage_rompu';
                detail   := 'empreinte précédente déclarée '
                            || coalesce(r.empreinte_precedente, '(nulle)')
                            || ' / réelle ' || coalesce(v_precedent_empreinte, '(nulle)');
                return next;
            end if;
        end if;

        v_precedent_numero    := r.numero;
        v_precedent_empreinte := r.empreinte;
    end loop;

    return;
end;
$$;

-- =====================================================================================
-- §4 — PROPRIÉTÉ ET DROIT D'EXÉCUTION DES DEUX FONCTIONS DU CHAÎNAGE
-- -------------------------------------------------------------------------------------
-- « create or replace » CONSERVE le propriétaire : les deux fonctions appartiennent déjà
-- à grc_proprietaire, puisque c'est lui qui applique les migrations. On le POSE malgré
-- tout, explicitement et par DÉCOUVERTE (pg_database.datdba) : une fonction « security
-- definer » dont le propriétaire ne serait pas celui qu'on croit s'exécuterait avec
-- d'autres droits que ceux qu'on a raisonnés, et le §6 vérifie ensuite que c'est bien le
-- cas — un garde-fou, pas une confiance.
--
-- LE DROIT D'EXÉCUTION NE RESTE PAS À PUBLIC. Trois précisions, dont deux comptent :
--   · f_journal_audit_chainage() : PostgreSQL vérifie « execute » sur une fonction de
--     déclencheur au moment du CREATE TRIGGER, pas à chaque déclenchement. Le retrait ne
--     casse donc aucune insertion — la morsure de test/journal-lecture/ le constate plutôt
--     que de le supposer — et il ferme la porte à un appel direct ;
--   · f_journal_audit_verifier(bigint) est RENDUE au rôle qui en a besoin : celui qui
--     porte « insert » sur journal_audit, c'est-à-dire le rôle applicatif, quel que soit
--     son nom (ROLE_APP de deploy/install.sh). DÉCOUVERT, pas recopié — le §19.5 vaut
--     aussi pour les noms de rôles ;
--   · le compte de SUPERVISION ne l'obtient pas. Il lit pour surveiller, il ne vérifie pas
--     l'intégrité d'un registre de preuve ; et c'est lui, précisément, dont ce fichier
--     retire la lecture du journal.
-- =====================================================================================

do $$
declare
    v_proprietaire text;
    v_role         text;
begin
    select r.rolname into v_proprietaire
      from pg_database d join pg_roles r on r.oid = d.datdba
     where d.datname = current_database();

    execute format('alter function f_journal_audit_chainage() owner to %I', v_proprietaire);
    execute format('alter function f_journal_audit_verifier(bigint) owner to %I', v_proprietaire);

    revoke execute on function f_journal_audit_chainage() from public;
    revoke execute on function f_journal_audit_verifier(bigint) from public;

    for v_role in
        select rr.rolname
          from pg_roles rr
         where rr.rolcanlogin and not rr.rolsuper and rr.rolname <> v_proprietaire
           and has_table_privilege(rr.oid, 'journal_audit', 'insert')
         order by 1
    loop
        execute format('grant execute on function f_journal_audit_verifier(bigint) to %I', v_role);
        raise notice 'Vérification du chaînage rendue exécutable par « % » (porteur d''insert '
                     'sur journal_audit).', v_role;
    end loop;
end;
$$;

-- =====================================================================================
-- §5 — E6 : LA POLITIQUE DE LECTURE SE RESSERRE
-- -------------------------------------------------------------------------------------
-- UNE SEULE POLITIQUE, ET UN « CASE » — les deux choix sont des remèdes, pas des goûts.
--
-- (a) POURQUOI UNE SEULE POLITIQUE, ALORS QUE 004 §6 EN ANNONÇAIT DEUX. Le commentaire de
--     004 proposait « une politique de lecture ciblée sur ce seul rôle » à côté de la
--     politique resserrée. Deux politiques permissives sont **combinées par OU**, et le
--     membre de gauche de ce OU appelle f_filiales_lecture(), qui LÈVE GRC04 lorsque la
--     transaction n'a pas déclaré son périmètre — ce qui est le cas ordinaire d'une
--     session psql du propriétaire, et de la moitié du banc d'essai. Il faudrait alors
--     compter sur le fait que le planificateur replie « quelconque OR true » en « true »
--     avant d'évaluer quoi que ce soit. Il le fait ; ce n'est écrit nulle part comme une
--     garantie, et ce qui en dépendrait est le CHAÎNAGE — c'est-à-dire toute écriture au
--     journal. On ne fait pas reposer une propriété de ce poids sur un repliage de
--     constantes.
--     Un « case » de SQL, lui, évalue ses branches dans l'ordre écrit, et c'est la norme
--     qui le dit. La branche du propriétaire est donc PREMIÈRE, et rien d'autre n'est
--     évalué pour lui.
--
-- (b) POURQUOI UN « CASE » ET NON UN « OR » — c'est la règle du §4 de 004_rls.sql, et elle
--     s'applique ici pour la deuxième fois. « filiale_id is null » n'est pas un cas
--     oublié : les échecs de connexion et le démarrage du service en portent, et ils
--     doivent être traités EXPLICITEMENT. Écrit en disjonction, l'un des membres appelle
--     f_filiales_lecture() sur une ligne transversale — sans effet utile, mais avec un
--     ordre d'évaluation non garanti, et donc une levée possible là où l'on voulait
--     seulement dire « non ».
--
-- CE QUE CHAQUE BRANCHE VAUT, dans l'ordre :
--   1. le propriétaire de la base lit tout — c'est ce qui rend le chaînage possible, et
--      c'est la contrepartie assumée, écrite en entête de ce fichier ;
--   2. une entrée SANS filiale (échec de connexion, démarrage) n'est lue que par un
--      périmètre Groupe — l'arbitrage du §29.7, et son coût ;
--   3. une entrée de filiale est lue par qui a cette filiale à son périmètre. C'est la
--      forme employée par les 35 tables cloisonnées du schéma ; le journal cesse d'être
--      l'exception.
--
-- ⚠️ LA DÉROGATION DE f_verifier_couverture_rls() RESTE EN PLACE, et ce n'est pas un
-- oubli. Ce garde-fou exige que TOUTE politique de lecture permissive d'une table
-- cloisonnée mentionne le périmètre ; la branche du propriétaire ci-dessous ne le
-- mentionne pas, et journal_audit reste donc dans sa liste de dérogations (005 §7). Ce
-- qui la remplace est plus précis qu'elle : f_verifier_lecture_journal(), au §6, exige de
-- cette politique les TROIS branches et vérifie les deux « security definer » qui les
-- rendent tenables. Retirer la dérogation sans réécrire le garde-fou de couverture ferait
-- rougir une politique correcte — et l'on apprendrait à ignorer un rouge.
-- =====================================================================================

drop policy pol_journal_audit_lecture on journal_audit;

create policy pol_journal_audit_lecture on journal_audit for select
    using (case
             when f_est_proprietaire_base() then true
             when filiale_id is null        then f_perimetre_groupe()
             else filiale_id = any (f_filiales_lecture())
           end);

comment on policy pol_journal_audit_lecture on journal_audit is
    'CLOISONNÉE depuis 008_journal_lecture.sql (condition d''entrée E6, CONVENTIONS.md §22 '
    'et §29.7). Elle disait « using (true) », dérogation assumée que le chaînage par '
    'empreinte imposait ; mesuré le 04/09/2026, cela donnait à grc_lecture — compte de '
    'supervision sans périmètre — la lecture de 160 entrées, logins et adresses IP '
    'compris. Trois branches, dans cet ordre et par « case » parce que l''ordre d''un '
    '« or » n''est pas garanti : le PROPRIÉTAIRE lit tout (c''est sous lui que s''exécutent '
    'f_journal_audit_chainage et f_journal_audit_verifier, devenues « security definer » '
    'dans la même migration : sans cette branche, la numérotation repartirait d''un numéro '
    'déjà pris et TOUTE écriture au journal échouerait) ; une entrée SANS filiale — échec '
    'de connexion, démarrage du service — n''est lue que par un périmètre GROUPE, pour ne '
    'pas donner à chaque filiale la liste des logins du groupe entier ; une entrée de '
    'filiale est lue par qui a cette filiale à son périmètre.';

-- =====================================================================================
-- §6 — LE GARDE-FOU NEUF : f_verifier_lecture_journal()
-- -------------------------------------------------------------------------------------
-- Il se BRANCHE tout seul : le point d'appel unique f_verifier_schema() DÉCOUVRE dans le
-- catalogue toute fonction « public.f_verifier_<x>() », sans argument, rendant
-- (objet, anomalie, detail), appartenant au propriétaire, ni « security definer » ni
-- volatile, au chemin de recherche figé (005 §3 et §6, CONVENTIONS.md §19.4). Aucun
-- fichier n'est à modifier, aucune liste n'est à allonger — c'est tout le propos.
--
-- CE QU'IL ATTRAPE, ET POURQUOI CHACUN COMPTE. Ce fichier corrige deux objets qui ne se
-- tiennent que l'un l'autre ; une migration future peut défaire l'un sans toucher à
-- l'autre, et le symptôme serait alors soit une fuite silencieuse, soit un service qui ne
-- peut plus rien tracer :
--   · « chainage_sans_definisseur » — la fonction a perdu son « security definer », son
--     propriétaire ou son chemin de recherche. Symptôme réel : plus aucune écriture au
--     journal, à la première insertion, en production ;
--   · « lecture_non_cloisonnee » — une politique de lecture permissive ne consulte plus le
--     périmètre. Symptôme réel : AUCUN. C'est la fuite silencieuse que E6 vient de fermer,
--     et c'est pour elle que ce garde-fou existe ;
--   · « transversales_non_traitees » — la politique consulte le périmètre mais ne dit rien
--     des entrées sans filiale. Symptôme réel : soit toutes les filiales lisent les échecs
--     de connexion du groupe (retour à la fuite), soit PERSONNE ne les lit, pas même le
--     RSSI Groupe — et c'est un journal qui ne prouve plus les tentatives d'intrusion ;
--   · « proprietaire_sans_lecture » — plus aucune branche ne rend la chaîne au
--     propriétaire. Même symptôme que le premier, par l'autre bout ;
--   · « politique_lecture_absente » — il n'existe plus AUCUNE politique de lecture. Le
--     journal devient illisible de tous, RSSI Groupe compris, et la consultation du §29.8
--     ne rend jamais rien. Anomalie distincte de la première, à dessein : répéter un même
--     défaut sous deux noms apprend à lire les anomalies en diagonale.
--
-- ⚠️ SA PORTÉE EXACTE, À NE PAS SURESTIMER (§17.5) : il lit des PRÉSENCES dans le
-- catalogue — un attribut de fonction, une mention dans un prédicat. Il ne prouve pas que
-- le prédicat soit JUSTE. Ce qui mord là, ce sont les essais de comportement de
-- test/journal-lecture/, qui rouvrent la politique et constatent que la lecture redevient
-- non cloisonnée.
-- =====================================================================================

create or replace function f_verifier_lecture_journal()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les deux fonctions dont le « security definer » est la condition du resserrement.
    -- Liste écrite à la main, et c'est le BON outil (CLAUDE.md §3) : son omission ferait
    -- échouer bruyamment — une fonction absente est signalée juste en dessous — jamais
    -- réussir en silence. Elles ne sont que deux, et elles sont nommées dans 004 §6.
    v_fonctions constant text[] := array['f_journal_audit_chainage()',
                                         'f_journal_audit_verifier(bigint)'];
    v_signature    text;
    v_proprietaire oid;
    r              record;
    v_politiques   integer := 0;
    v_transversale boolean := false;
    v_proprio      boolean := false;
begin
    select d.datdba into v_proprietaire
      from pg_database d where d.datname = current_database();

    if to_regclass('public.journal_audit') is null then
        objet    := 'journal_audit';
        anomalie := 'table_absente';
        detail   := 'la table du journal d''audit n''existe plus : les contrôles de sa lecture '
                    'ne portent plus sur rien (001_socle.sql §9)';
        return next;
        return;
    end if;

    -- ── 1. Les deux fonctions du chaînage ───────────────────────────────────────────
    foreach v_signature in array v_fonctions loop
        if to_regprocedure('public.' || v_signature) is null then
            objet    := v_signature;
            anomalie := 'chainage_sans_definisseur';
            detail   := 'fonction introuvable : le chaînage du journal ne repose plus sur '
                        'rien (001_socle.sql §9)';
            return next;
            continue;
        end if;

        for r in
            select p.prosecdef                                  as definisseur,
                   (p.proowner = v_proprietaire)                as au_proprietaire,
                   exists (
                       select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as c
                        where c like 'search\_path=%'
                          and btrim(btrim(split_part(
                                  c, ',', array_length(string_to_array(c, ','), 1))), '"')
                              = 'pg_temp')                      as chemin_fige
              from pg_proc p
             where p.oid = to_regprocedure('public.' || v_signature)
        loop
            if not (r.definisseur and r.au_proprietaire and r.chemin_fige) then
                objet    := v_signature;
                anomalie := 'chainage_sans_definisseur';
                detail   := format(
                    'security definer = %s, appartient au propriétaire de la base = %s, chemin '
                    'de recherche figé = %s. Les trois sont exigés : la politique de lecture de '
                    'journal_audit est cloisonnée depuis 008, et cette fonction lit la chaîne '
                    'ENTIÈRE. Sans « security definer », la numérotation repart d''un numéro '
                    'déjà pris et TOUTE écriture au journal échoue ; sans chemin figé, une '
                    'table homonyme de pg_temp est lue à la place de la vraie.',
                    r.definisseur, r.au_proprietaire, r.chemin_fige);
                return next;
            end if;
        end loop;
    end loop;

    -- ── 2. La politique de lecture, branche par branche ─────────────────────────────
    --
    -- On balaye TOUTES les politiques permissives de lecture, pas seulement celle que 008
    -- a posée : une politique AJOUTÉE à côté serait combinée par OU, et une seule d'entre
    -- elles disant « true » rouvrirait la table en grand.
    for r in
        select p.polname::text                                       as nom,
               coalesce(pg_get_expr(p.polqual, p.polrelid), 'true')  as predicat
          from pg_policy p
         where p.polrelid = 'journal_audit'::regclass
           and p.polpermissive and p.polcmd in ('r', '*')
         order by p.polname
    loop
        v_politiques := v_politiques + 1;

        if r.predicat !~ '(f_filiales_lecture|f_filiales_autorisees)' then
            objet    := r.nom;
            anomalie := 'lecture_non_cloisonnee';
            detail   := format(
                'cette politique de lecture du journal ne consulte pas le périmètre de la '
                'session : « %s ». Les politiques permissives se combinent par OU — une seule '
                'qui ne cloisonne pas rend le journal entier lisible de toutes les filiales, '
                'sans qu''aucun symptôme ne le dise. C''est la condition d''entrée E6 '
                '(CONVENTIONS.md §22 et §29.7), fermée par 008_journal_lecture.sql.', r.predicat);
            return next;
        end if;

        if r.predicat ~ 'f_perimetre_groupe' then v_transversale := true; end if;
        if r.predicat ~ 'f_est_proprietaire_base' then v_proprio := true; end if;
    end loop;

    -- Le cas « aucune politique du tout ». Il est SÉPARÉ du précédent, et non
    -- cumulé avec lui : une politique ouverte est déjà signalée nommément par la
    -- boucle, et répéter le même défaut sous un second nom apprend à lire les
    -- anomalies en diagonale. Ce cas-ci dit autre chose — le journal est
    -- devenu ILLISIBLE, y compris pour le RSSI Groupe.
    if v_politiques = 0 then
        objet    := 'pol_journal_audit_lecture';
        anomalie := 'politique_lecture_absente';
        detail   := 'aucune politique permissive de lecture sur journal_audit : le journal '
                    'est illisible de tous, et la consultation prévue au CONVENTIONS.md §29.8 '
                    'ne rendra jamais rien';
        return next;
        return;
    end if;

    if not v_transversale then
        objet    := 'pol_journal_audit_lecture';
        anomalie := 'transversales_non_traitees';
        detail   := 'aucune politique de lecture ne mentionne f_perimetre_groupe() : les '
                    'entrées à filiale_id NUL — échec de connexion, démarrage du service — ne '
                    'sont plus traitées explicitement. Ou bien elles retombent dans le cas '
                    'général et chaque filiale lit les tentatives de connexion du groupe '
                    'entier (l''oracle inter-filiales que le §29.7 ferme), ou bien plus '
                    'personne ne les lit, pas même le RSSI Groupe — et le journal cesse de '
                    'prouver ce qu''il existe pour prouver';
        return next;
    end if;

    if not v_proprio then
        objet    := 'pol_journal_audit_lecture';
        anomalie := 'proprietaire_sans_lecture';
        detail   := 'aucune politique de lecture ne mentionne f_est_proprietaire_base() : les '
                    'deux fonctions de chaînage, « security definer » et donc exécutées sous '
                    'le propriétaire, ne voient plus la chaîne entière. La numérotation '
                    'repartira d''un numéro déjà pris et la PREMIÈRE écriture au journal '
                    'échouera — en production, à la première connexion';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_lecture_journal() is
    'Garde-fou de schéma (CONVENTIONS.md §19.4) : la lecture du journal d''audit reste '
    'cloisonnée, et le chaînage reste possible. Il tient ensemble les DEUX moitiés de la '
    'condition d''entrée E6, que 008_journal_lecture.sql pose dans la même transaction et '
    'qu''une migration future pourrait défaire séparément : les deux fonctions du chaînage '
    'sont « security definer », au propriétaire de la base, chemin de recherche figé ; et '
    'toute politique permissive de lecture de journal_audit consulte le périmètre '
    '(f_filiales_lecture), traite explicitement les entrées transversales '
    '(f_perimetre_groupe) et rend la chaîne au propriétaire (f_est_proprietaire_base). '
    'PORTÉE EXACTE (§17.5) : il lit des présences dans le catalogue, pas la justesse d''un '
    'prédicat. Ce qui mord là, ce sont les essais de test/journal-lecture/. '
    'Un schéma sain ne renvoie AUCUNE ligne.';

-- =====================================================================================
-- §7 — CONSIGNATION, PUIS VÉRIFICATION
-- -------------------------------------------------------------------------------------
-- Les trois instructions qui closent toute migration depuis 005 §10.
-- =====================================================================================

do $$
declare
    v_poses integer;
    v_armes integer;
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

    if not exists (select 1 from controles_schema
                    where fonction = 'f_verifier_lecture_journal') then
        raise exception 'f_verifier_lecture_journal() n''a pas été consignée : elle ne remplit '
                        'pas les conditions de la découverte (§20.1).'
            using hint = 'Propriétaire de la base, ni « security definer » ni volatile, '
                         'chemin de recherche figé finissant par pg_temp.';
    end if;
end;
$$;

-- Le chaînage doit rester SAIN après le resserrement. Un « create or replace » ne touche
-- à aucune ligne, mais l'affirmer ne coûte rien et le constater coûte une requête : c'est
-- exactement la différence entre une réserve écrite et une réserve traitée.
do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('  - n° %s : %s (%s)', numero_entree, anomalie, detail),
                      E'\n' order by numero_entree),
           count(*)
      into v_anomalies, v_nombre
      from f_journal_audit_verifier();

    if v_nombre > 0 then
        raise exception E'Chaîne du journal d''audit en défaut après resserrement — % anomalie(s) :\n%',
                        v_nombre, v_anomalies
            using hint = 'Voir backend/db/CONVENTIONS.md §12.';
    end if;

    raise notice 'Chaîne du journal vérifiée : % entrée(s), aucune anomalie.',
                 (select count(*) from journal_audit);
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
-- §8 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('008', 'Lecture du journal d''audit cloisonnée sur le périmètre (condition E6) ; '
               'les deux fonctions de chaînage passent en « security definer » ; '
               'garde-fou f_verifier_lecture_journal')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Rejouer ce bloc rouvre la lecture du journal à toutes les filiales et au compte de
-- supervision : c'est la dette E6, réinstallée. Il n'est écrit que parce qu'une migration
-- sans porte de sortie est une migration qu'on n'ose pas appliquer.
--
-- ⚠️ Les DEUX moitiés se défont ensemble, dans cet ordre : rouvrir la lecture d'abord,
-- retirer les « security definer » ensuite. L'ordre inverse laisse, entre les deux
-- instructions, une base où plus aucune écriture au journal ne passe.
--
--   begin;
--   drop policy pol_journal_audit_lecture on journal_audit;
--   create policy pol_journal_audit_lecture on journal_audit for select using (true);
--   -- reposer f_journal_audit_chainage() et f_journal_audit_verifier(bigint) dans leur
--   -- forme de 001_socle.sql, c'est-à-dire SANS « security definer » ;
--   select f_retirer_controle_schema('f_verifier_lecture_journal', 'annulation de 008');
--   drop function if exists f_verifier_lecture_journal();
--   drop function if exists f_perimetre_groupe();
--   drop function if exists f_est_proprietaire_base();
--   delete from migrations_schema where version = '008';
--   commit;
-- =====================================================================================
