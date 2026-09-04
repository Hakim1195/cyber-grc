-- =====================================================================================
--  010 — LECTURE DE `filiales` CLOISONNÉE SUR LE PÉRIMÈTRE  (constat Q-132)
-- -------------------------------------------------------------------------------------
--  Contrat : `backend/db/CONVENTIONS.md` §32, écrit AVANT ce fichier.
--
--  §1  f_perimetre_groupe() devient « security definer »
--  §2  La politique de lecture se resserre
--  §3  Le garde-fou neuf : f_verifier_lecture_filiales()
--  §4  Consignation, puis vérification
--  §5  Enregistrement de la migration
--
-- -------------------------------------------------------------------------------------
--  CE QUE CE FICHIER FERME, ET LE PIÈGE QU'IL ÉVITE
--
--  `pol_filiales_lecture` valait `using (true)`. Mesuré le 04/09/2026 :
--
--      périmètre déclaré : UNE filiale (DEU)
--      filiales lues     : 2   → DEU ET TLS
--      risques lus (témoin, table cloisonnée) : 0
--
--  Le témoin donne son sens à la mesure : le périmètre ÉTAIT bien posé — c'est la table
--  qui ne le respectait pas. Elle porte raison_sociale, adresse, ville, pays, téléphone,
--  email. Ce qui rend le constat sérieux n'est pas tant la donnée que la FORME : c'est le
--  motif de Q-118, l'application seule barrière et la RLS pas un filet.
--
--  ⚠️ LE PIÈGE EST CELUI D'E6, À L'IDENTIQUE, et il coûterait plus cher ici.
--
--  Trois lecteurs de `filiales` n'ont PAS de périmètre, par construction :
--
--      src/droits/resolution.ts   il RÉSOUT le périmètre — il n'en a pas encore
--      src/droits/groupes-ad.ts   engendre la liste des groupes AD
--      src/api/session.ts         session provisoire (développement)
--
--  Un resserrement naïf ne rendrait donc pas le produit « non conforme » : il le rendrait
--  INUTILISABLE — plus personne ne pourrait se connecter.
--
--  Et un quatrième lecteur est le piège du journal : f_perimetre_groupe() (008 §1) LIT
--  `filiales` pour comparer le périmètre aux filiales actives. Une politique qui l'appelle
--  se rappelle elle-même.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — f_perimetre_groupe() DEVIENT « SECURITY DEFINER »
-- -------------------------------------------------------------------------------------
-- Même geste qu'au §2 de 008, et pour la même raison : la fonction doit lire la table que
-- la politique protège. Sous le propriétaire, la PREMIÈRE branche du `case` du §2 la
-- reconnaît immédiatement — la récursion se termine au premier tour au lieu de ne pas
-- commencer.
--
-- ⚠️ Le corps est INCHANGÉ, à la lettre. Seul le mode d'exécution bouge. Un « security
-- definer » qui changerait aussi la logique mêlerait deux décisions dans une, et la
-- seconde passerait inaperçue.
--
-- `set search_path` est reconduit et il est ici une CONDITION DE SÛRETÉ, pas un style
-- (§17.2) : une fonction « security definer » sans chemin figé est une élévation de
-- privilège offerte au premier schéma que l'appelant sait poser devant.
-- =====================================================================================

create or replace function f_perimetre_groupe() returns boolean
    language sql stable
    security definer
    set search_path = pg_catalog, public, pg_temp as
$$
    select exists (select 1 from filiales f where f.statut = 'active')
       and not exists (select 1 from filiales f
                        where f.statut = 'active'
                          and not (f.id = any (f_filiales_lecture())));
$$;

alter function f_perimetre_groupe() owner to grc_proprietaire;

comment on function f_perimetre_groupe() is
    'La session lit-elle le GROUPE ENTIER ? Vrai lorsque son périmètre de lecture couvre '
    'toutes les filiales actives. Faux s''il n''existe aucune filiale active : un prédicat '
    'de cloisonnement ne rend jamais « vrai » faute de matière. '
    '« SECURITY DEFINER » depuis 010 : elle lit `filiales`, que sa propre politique de '
    'lecture protège désormais (constat Q-132). Sous le propriétaire, la première branche '
    'du « case » de pol_filiales_lecture la reconnaît, et la récursion se termine au '
    'premier tour. Le corps est inchangé depuis 008 ; seul le mode d''exécution a bougé.';

-- =====================================================================================
-- §1 bis — f_filiales_actives() : CE DONT L'AUTHENTIFICATION A RÉELLEMENT BESOIN
-- -------------------------------------------------------------------------------------
-- ⚠️ CE PARAGRAPHE EXISTE PARCE QU'UN GARDE-FOU A REFUSÉ LE PREMIER JET, ET IL AVAIT
-- RAISON.
--
-- La première rédaction exemptait la transaction d'authentification dans la politique
-- elle-même : « when f_authentification() then true ». `f_verifier_substrat_session()`
-- (007 §7) l'a refusée en `authentification_en_lecture`, avec ce motif, écrit avant moi :
--
--     « une politique de LECTURE, sur n'importe quelle table du schéma, qui mentionne
--       f_authentification(). UN RÉGLAGE DE SESSION NE DOIT JAMAIS ÉLARGIR LA LECTURE ;
--       c'est ce que le 004 §8 interdit déjà au drapeau d'administration, et il n'y a pas
--       de raison que le second réglage échappe à la règle du premier. »
--
-- C'est juste, et le contrat du CONVENTIONS.md §32 a été corrigé en conséquence : un
-- réglage que la couche applicative pose ne peut pas devenir une clé de lecture, sans quoi
-- une injection dans le rôle applicatif ouvrirait la table en posant un `set_config`.
--
-- CE QUE LES TROIS LECTEURS DEMANDENT VRAIMENT. Aucun ne veut « accéder à la table » :
-- tous veulent LA LISTE DES FILIALES ACTIVES, avant qu'un périmètre existe.
--
--     src/droits/resolution.ts   les identifiants, pour construire un périmètre Groupe
--     src/droits/groupes-ad.ts   id + code + raison sociale, pour engendrer les groupes AD
--     src/api/session.ts         idem, pour la session provisoire de développement
--
-- Une fonction « security definer » leur rend exactement cela, et rien d'autre : une
-- surface étroite, nommée, auditable — au lieu d'une dérogation de politique qui, elle,
-- s'appliquerait à TOUTE requête de la transaction, y compris celles qu'on n'a pas prévues.
-- =====================================================================================

create or replace function f_filiales_actives()
returns table (id id_metier, code text, raison_sociale text)
    language sql stable
    security definer
    set search_path = pg_catalog, public, pg_temp as
$$
    select f.id, f.code, f.raison_sociale
      from filiales f
     where f.statut = 'active'
     order by f.code;
$$;

alter function f_filiales_actives() owner to grc_proprietaire;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant execute on function f_filiales_actives() to grc_app';
    end if;
end;
$$;

comment on function f_filiales_actives() is
    'La liste des filiales ACTIVES — identifiant, code, raison sociale —, lisible AVANT '
    'qu''un périmètre existe. C''est ce dont la résolution du périmètre a besoin, et elle '
    'ne peut par construction pas avoir de périmètre : elle est en train d''en fabriquer un. '
    '« SECURITY DEFINER » à dessein, et c''est la forme ÉTROITE du besoin : une exemption '
    'écrite dans pol_filiales_lecture s''appliquerait à TOUTE requête de la transaction, y '
    'compris celles qu''on n''a pas prévues ; celle-ci rend trois colonnes et rien d''autre. '
    'Elle ne rend PAS l''adresse, le téléphone ni le courriel — ce que la fuite du constat '
    'Q-132 exposait. Le premier jet de 010 exemptait f_authentification() dans la politique ; '
    'f_verifier_substrat_session() l''a refusé, et il avait raison (CONVENTIONS.md §32.2).';

-- =====================================================================================
-- §2 — LA POLITIQUE DE LECTURE SE RESSERRE
-- -------------------------------------------------------------------------------------
-- « case » et NON « or », et l'ordre est normatif — même raison qu'au §4 de 004_rls.sql :
-- l'ordre d'évaluation d'un « or » n'est pas garanti, et les deux derniers membres LÈVENT
-- GRC04 quand aucun périmètre n'est déclaré. La transaction d'authentification doit donc
-- être reconnue AVANT qu'on les évalue.
--
-- ⚠️ AUCUNE exemption pour l'authentification ici : elle passe par f_filiales_actives()
-- (§1 bis), parce qu'un réglage de session ne doit jamais élargir la lecture. Le premier
-- jet la mettait dans ce prédicat ; f_verifier_substrat_session() l'a refusée.
-- =====================================================================================

drop policy if exists pol_filiales_lecture on filiales;

create policy pol_filiales_lecture on filiales for select using (
    case
        when f_est_proprietaire_base() then true   -- exploitation, garde-fous, chaînage
        when f_perimetre_groupe()      then true   -- la vision Groupe de la direction
        else id = any (f_filiales_lecture())       -- chacun la sienne
    end
);

comment on policy pol_filiales_lecture on filiales is
    'Cloisonnée depuis 010 (constat Q-132). Elle valait « using (true) » : une session '
    'd''UNE filiale lisait la raison sociale, l''adresse, la ville, le téléphone et le '
    'courriel des VINGT filiales du groupe — et l''existence d''une filiale peut précéder '
    'son annonce, le groupe faisant des acquisitions régulières. '
    'Trois cas, dans un « case » dont l''ORDRE EST NORMATIF : le propriétaire (exploitation), '
    'le périmètre Groupe, puis chacun la sienne. Les deux derniers membres lèvent GRC04 sans '
    'périmètre déclaré : un « or » les évaluerait peut-être en premier. '
    'La RÉSOLUTION du périmètre, qui n''en a pas encore, passe par f_filiales_actives() et '
    'non par une exemption ici : un réglage de session ne doit jamais élargir la lecture.';

-- =====================================================================================
-- §3 — LE GARDE-FOU NEUF : f_verifier_lecture_filiales()
-- -------------------------------------------------------------------------------------
-- Il se BRANCHE tout seul : f_verifier_schema() découvre dans le catalogue les fonctions
-- qui respectent la convention d'écriture (§18.4, §19.4). Aucune liste à tenir.
--
-- PORTÉE EXACTE (§17.5) : il constate des PRÉSENCES dans le catalogue — que la politique
-- existe, qu'elle ne soit pas ouverte, qu'elle nomme les quatre cas, et que la fonction du
-- périmètre Groupe soit bien « security definer ». Il ne juge pas la JUSTESSE du prédicat :
-- ce qui mord là, ce sont les essais de test/filiales/.
-- =====================================================================================

create or replace function f_verifier_lecture_filiales()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_predicat text;
    v_secdef   boolean;
begin
    select pg_get_expr(p.polqual, p.polrelid)
      into v_predicat
      from pg_policy p
     where p.polrelid = 'filiales'::regclass
       and p.polname  = 'pol_filiales_lecture'
       and p.polcmd   = 'r';

    if v_predicat is null then
        objet := 'pol_filiales_lecture'; anomalie := 'politique_lecture_absente';
        detail := 'Sans politique de lecture, « force row level security » ne rend AUCUNE '
                  'ligne : la table devient illisible, y compris pour l''authentification.';
        return next; return;
    end if;

    if v_predicat = 'true' then
        objet := 'pol_filiales_lecture'; anomalie := 'lecture_non_cloisonnee';
        detail := 'La lecture est ouverte : une session d''une filiale lit les vingt du '
                  'groupe (constat Q-132).';
        return next;
    end if;

    -- ⚠️ L'INVERSE de ce que le premier jet vérifiait : la politique ne doit PAS
    -- mentionner f_authentification(). Un réglage de session n'élargit pas la lecture
    -- (007 §7, anomalie « authentification_en_lecture »). La résolution du périmètre
    -- passe par f_filiales_actives(), dont la surface est étroite et nommée.
    if v_predicat like '%f_authentification%' then
        objet := 'pol_filiales_lecture'; anomalie := 'reglage_de_session_en_lecture';
        detail := 'Un réglage que la couche applicative pose deviendrait une clé de '
                  'lecture : une injection dans le rôle applicatif ouvrirait la table '
                  'en posant un set_config (CONVENTIONS.md §32.2).';
        return next;
    end if;

    if v_predicat not like '%f_perimetre_groupe%' then
        objet := 'pol_filiales_lecture'; anomalie := 'vision_groupe_perdue';
        detail := 'La direction ne verrait plus que sa filiale active.';
        return next;
    end if;

    if v_predicat not like '%f_filiales_lecture%' then
        objet := 'pol_filiales_lecture'; anomalie := 'perimetre_non_applique';
        detail := 'Le prédicat ne consulte pas le périmètre de la session.';
        return next;
    end if;

    -- La moitié sans laquelle le resserrement se retourne en récursion.
    select p.prosecdef into v_secdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'f_perimetre_groupe';

    if v_secdef is null then
        objet := 'f_perimetre_groupe()'; anomalie := 'fonction_absente';
        detail := 'La politique l''appelle : sans elle, toute lecture de filiales échoue.';
        return next;
    elsif not v_secdef then
        objet := 'f_perimetre_groupe()'; anomalie := 'security_definer_manquant';
        detail := 'Elle LIT « filiales », que la politique protège : sans « security '
                  'definer », la politique se rappelle elle-même (CONVENTIONS.md §32.2).';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_lecture_filiales() is
    'Garde-fou du constat Q-132 : la lecture de « filiales » est cloisonnée, et les trois '
    'dérogations qui la rendent praticable sont nommées — le propriétaire, la transaction '
    'd''authentification, le périmètre Groupe. Vérifie aussi le « security definer » de '
    'f_perimetre_groupe(), sans lequel le resserrement se retourne en récursion. '
    'PORTÉE EXACTE (§17.5) : il lit des présences dans le catalogue, pas la justesse d''un '
    'prédicat. Ce qui mord là, ce sont les essais de test/filiales/. '
    'Un schéma sain ne renvoie AUCUNE ligne.';

-- =====================================================================================
-- §4 — CONSIGNATION, PUIS VÉRIFICATION
-- =====================================================================================

do $$
declare
    v_poses integer;
    v_armes integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    v_armes := f_armer_declencheurs();
    raise notice 'Traçabilité d''insertion : % déclencheur(s) posé(s) ; % (ré)armé(s).',
                 v_poses, v_armes;
end;
$$;

do $$
declare
    v_nombre integer;
begin
    select count(*) into v_nombre from f_consigner_controles_schema();
    raise notice 'Registre des garde-fous : % mouvement(s). Total consigné : %.',
                 v_nombre, (select count(*) from controles_schema);

    if not exists (select 1 from controles_schema
                    where fonction = 'f_verifier_lecture_filiales') then
        raise exception 'f_verifier_lecture_filiales() n''a pas été consignée : elle ne '
                        'remplit pas les conditions de la découverte (§20.1).'
            using hint = 'Propriétaire de la base, ni « security definer » ni volatile, '
                         'chemin de recherche figé finissant par pg_temp.';
    end if;
end;
$$;

-- Le schéma entier doit rester sain APRÈS le resserrement. L'affirmer ne coûte rien ;
-- le constater coûte une requête — c'est la différence entre une réserve écrite et une
-- réserve traitée.
do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('%s / %s', objet, anomalie), ', '), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 010 : %', v_anomalies
            using hint = 'Le resserrement de filiales a cassé un garde-fou existant.';
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie après le resserrement de filiales.';
end;
$$;

-- =====================================================================================
-- §5 — ENREGISTREMENT
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('010', 'Lecture de « filiales » cloisonnée sur le périmètre (constat Q-132) ; '
               'f_perimetre_groupe() passe en « security definer » ; '
               'garde-fou f_verifier_lecture_filiales')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- ⚠️ Les deux moitiés se défont ENSEMBLE, et dans cet ordre : rouvrir la lecture d'abord,
-- retirer le « security definer » ensuite. L'ordre inverse laisse, entre les deux
-- instructions, une base où f_perimetre_groupe() ne peut plus lire `filiales` — donc où la
-- politique encore en place refuse tout.
--
--   begin;
--   drop policy pol_filiales_lecture on filiales;
--   create policy pol_filiales_lecture on filiales for select using (true);
--   -- reposer f_perimetre_groupe() dans sa forme de 008, c'est-à-dire SANS security definer
--   select f_retirer_controle_schema('f_verifier_lecture_filiales', 'annulation de 010');
--   drop function if exists f_verifier_lecture_filiales();
--   delete from migrations_schema where version = '010';
--   commit;
-- =====================================================================================
