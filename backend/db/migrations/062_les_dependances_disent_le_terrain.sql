-- =====================================================================================
--  062 — LES DÉPENDANCES ENTRE ACTIFS DISENT ENFIN CE QUI SE PASSE SUR LE TERRAIN
--
--  §0   Le périmètre de la migration
--  §1   Quatre types de lien de plus — et chacun décrit un chemin de panne RÉEL
--  §2   Deux qualificatifs — ce qui rend la propagation crédible
--  §3   L'exploitant d'un actif : le lien vers un TIERS
--  §4   `type_entite`
--  §5   Cloisonnement
--  §6   Le registre de l'article 30
--  §7   Le garde-fou — il ÉPROUVE, il ne reconnaît pas un mot
--  §8   Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Utilisateur, 22/09/2026 : *« dans le module Actifs, il faudrait enrichir les relations
--  entre actifs pour les rendre plus conformes à la réalité du terrain, et que ça soit
--  aussi cohérent avec la cartographie. »*
--
--  ── CE QUE LE MODÈLE NE SAVAIT PAS DIRE ─────────────────────────────────────────
--
--  Quatre types de lien depuis la v9 : `dep`, `hosted`, `flux`, `backup`. Ils suffisent à
--  dessiner un graphe ; ils ne suffisent pas à répondre aux deux questions qu'un RSSI
--  pose devant ce graphe :
--
--    1. **« par où entre-t-on, et par où se propage-t-on ? »** — l'annuaire, le bastion,
--       le lien opérateur ne se distinguaient pas d'une dépendance quelconque. Or
--       l'annuaire est le point de défaillance unique le plus fréquent d'un groupe
--       industriel, et le poste d'administration est le chemin que prend un attaquant.
--       Les noyer dans « dépend de » prive la carte de sa valeur en analyse de risque ;
--    2. **« A tient combien de temps sans B ? »** — la propagation était BINAIRE : B
--       tombe, donc A tombe. En vrai, une dépendance avec quarante-huit heures
--       d'autonomie et une dépendance à effet immédiat ne produisent pas la même crise,
--       et le plan de continuité ne s'écrit pas pareil.
--
--  ⚠️ **Et une troisième, qui traversait deux modules sans les relier** : depuis le lot
--  L21 le produit connaît les prestataires, la chaîne de sous-traitance et le registre
--  DORA — mais un actif ne pouvait pas déclarer « exploité par tel infogérant ». C'est
--  pourtant la dépendance la plus contrôlée par NIS2 et DORA, et elle était saisie deux
--  fois, dans deux écrans qui ne se parlaient pas.
--
--  ── ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS ───────────────────────────────────────
--
--  **Elle ne touche à aucune donnée existante.** Les quatre types d'origine gardent leur
--  sens à l'octet près, les deux qualificatifs sont NULLABLES, et `null` s'y lit
--  « non renseigné » — jamais « immédiat », jamais « aucun mode dégradé ». Une
--  dépendance saisie avant aujourd'hui ne se met pas à affirmer quelque chose que
--  personne n'a dit (motif du constat **Q-192**).
--
--  **Elle ne décide pas ce qui propage une panne.** Le discriminant vit dans
--  `js/modules/cartographie.js` (`DEP_TYPES[t].propagates`), qui est la seule source du
--  produit et que deux écrans lisent. Le recopier en base en ferait une seconde, et la
--  seconde rédaction gagne toujours au mauvais moment (constat **Q-219**).
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Le §1 remplace une contrainte `check`, ce qui VALIDE les lignes existantes ; le §3
-- crée une table dont les clés se valident contre `actifs` et `prestataires`, toutes
-- deux cloisonnées. Sans périmètre, la validation ne verrait aucune ligne et la
-- migration passerait pour un mauvais motif (`CONVENTIONS.md` §42).
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-062', true);
    perform set_config('grc.filiales',
                       coalesce((select string_agg(id, ',') from filiales), ''), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — QUATRE TYPES DE LIEN DE PLUS
-- -------------------------------------------------------------------------------------
-- Chacun décrit un chemin de panne ou d'attaque que la carte ne savait pas dire :
--
--   `authentifie_par` — annuaire, fournisseur d'identité, SSO. **Le point de
--       défaillance unique le plus fréquent d'un groupe industriel**, et il était
--       jusqu'ici saisi en « dépend de », noyé avec le reste.
--   `administre_par`  — bastion, poste d'administration, outil d'infogérance. C'est le
--       chemin que prend un attaquant : ne pas le distinguer prive la carte de sa
--       valeur en analyse de risque.
--   `transite_par`    — lien WAN, VPN, opérateur.
--   `redonde_par`     — cluster, second site. ⚠️ **Sémantique différente de `backup`** :
--       la sauvegarde ne propage pas une panne mais ne l'évite pas non plus ; la
--       redondance RÉDUIT l'impact immédiat. Les confondre fausse le calcul de point de
--       défaillance unique, qui est la seule chose que cette carte sait produire.
--
-- ⚠️ **La contrainte se REMPLACE, elle ne s'étend pas.** PostgreSQL n'a pas d'« alter
-- check » : on la retire et on la repose, en VALIDANT les lignes existantes — ce que le
-- §0 rend possible.
-- =====================================================================================

alter table actif_dependances
    drop constraint if exists ck_actif_dependances_type;

alter table actif_dependances
    add constraint ck_actif_dependances_type check (type in (
        -- Les quatre d'origine (v9), à l'octet près.
        'dep', 'hosted', 'flux', 'backup',
        -- Les quatre de la 062.
        'authentifie_par', 'administre_par', 'transite_par', 'redonde_par'));

comment on constraint ck_actif_dependances_type on actif_dependances is
    'Huit natures de lien. ⚠️ « redonde_par » et « backup » ne se confondent pas : la '
    'sauvegarde porte la capacité de RESTAURATION et ne propage pas une panne ; la '
    'redondance REND LE SERVICE pendant la panne. Les mélanger fausse le calcul de point '
    'de défaillance unique. ⚠️ Ce qui PROPAGE une panne se décide dans '
    'js/modules/cartographie.js (DEP_TYPES), seule source du produit : le recopier ici '
    'en ferait une seconde, et deux rédactions divergent (constat Q-219).';

-- =====================================================================================
-- §2 — DEUX QUALIFICATIFS — CE QUI REND LA PROPAGATION CRÉDIBLE
-- -------------------------------------------------------------------------------------
-- La propagation était BINAIRE. La question d'un RSSI, elle, est « A tient combien de
-- temps sans B ? » — et c'est elle qui transforme un rayon d'impact en CHRONOLOGIE,
-- confrontable aux RTO du bilan d'impact.
--
-- ⚠️ **Les deux sont NULLABLES, et `null` veut dire « non renseigné ».** Pas
-- « immédiat », pas « aucun mode dégradé » : les milliers de dépendances déjà saisies
-- n'ont rien dit là-dessus, et leur faire dire le pire ferait paraître mesurée une
-- chronologie que personne n'a établie. C'est le motif du constat **Q-192**, et celui
-- des six colonnes d'échelle de la `049`.
-- =====================================================================================

alter table actif_dependances
    add column if not exists delai_impact text;
alter table actif_dependances
    add column if not exists mode_degrade text;

alter table actif_dependances
    drop constraint if exists ck_actif_dependances_delai;
alter table actif_dependances
    add constraint ck_actif_dependances_delai check (
        delai_impact is null or delai_impact in (
            'immediat',   -- A tombe avec B
            'heures',     -- quelques heures d'autonomie
            'jour',       -- une journée
            'semaine'));  -- une semaine ou plus

alter table actif_dependances
    drop constraint if exists ck_actif_dependances_degrade;
alter table actif_dependances
    add constraint ck_actif_dependances_degrade check (
        mode_degrade is null or mode_degrade in ('non', 'partiel', 'oui'));

comment on column actif_dependances.delai_impact is
    'Combien de temps l''actif source tient SANS sa cible : immediat / heures / jour / '
    'semaine. ⚠️ NULL = NON RENSEIGNÉ, jamais « immédiat » : les dépendances saisies '
    'avant la 062 n''ont rien dit là-dessus, et leur faire dire le pire ferait paraître '
    'mesurée une chronologie que personne n''a établie (motif Q-192). C''est ce champ '
    'qui transforme un rayon d''impact en CHRONOLOGIE, confrontable aux RTO du BIA.';
comment on column actif_dependances.mode_degrade is
    'Un fonctionnement dégradé existe-t-il sans la cible : non / partiel / oui. '
    '⚠️ NULL = non renseigné. C''est ce qui distingue une dépendance VITALE d''une '
    'dépendance de confort — et la distinction ne se devine pas du type de lien.';

-- =====================================================================================
-- §3 — L'EXPLOITANT D'UN ACTIF : LE LIEN VERS UN TIERS
-- -------------------------------------------------------------------------------------
-- Depuis le lot L21, le produit connaît les prestataires, leur chaîne de sous-traitance
-- et le registre d'information DORA. Un actif ne pouvait pourtant pas déclarer qui
-- l'exploite — alors que c'est la dépendance la plus contrôlée par NIS2 (art. 21 §2 d)
-- et par DORA (art. 28). Elle était saisie deux fois, dans deux écrans qui ne se
-- parlaient pas.
--
-- ⚠️ **Table de LIAISON, cloisonnée par ses deux parents**, comme `actif_risques` : elle
-- ne porte pas de `filiale_id` à elle, et ses politiques exigent que les DEUX extrémités
-- soient dans le périmètre. C'est ce qui empêche un actif de Toulouse de pointer un
-- prestataire de Hambourg — une arête inter-filiales que rien d'autre ne verrait.
-- =====================================================================================

create table if not exists actif_prestataires (
    actif_id       id_metier   not null,
    prestataire_id id_metier   not null,
    -- Ce que le tiers FAIT de cet actif. ⚠️ Vocabulaire fermé : « exploite » et
    -- « héberge » n'engagent pas les mêmes obligations contractuelles, et un texte
    -- libre rendrait le registre DORA inexploitable.
    nature         text        not null default 'exploitation',
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    constraint pk_actif_prestataires primary key (actif_id, prestataire_id, nature),
    constraint fk_actif_prestataires_actif foreign key (actif_id)
        references actifs(id) on delete cascade,
    constraint fk_actif_prestataires_prestataire foreign key (prestataire_id)
        references prestataires(id) on delete cascade,
    constraint ck_actif_prestataires_nature check (nature in (
        'exploitation',  -- il fait tourner l'actif au quotidien
        'hebergement',   -- il en détient le support physique ou l'infrastructure
        'maintenance',   -- il intervient dessus, sans l'exploiter
        'infogerance',   -- il l'administre à la place du client
        'editeur'))      -- il en fournit le logiciel
);

-- ⚠️ La clé primaire ne couvre pas la seconde colonne : la cascade « purge des liens
-- d'un prestataire supprimé » en a besoin, exactement comme `ix_actif_dependances_cible`.
create index if not exists ix_actif_prestataires_prestataire
    on actif_prestataires (prestataire_id);

comment on table actif_prestataires is
    'Qui EXPLOITE un actif. ⚠️ La clé primaire porte la NATURE : un même tiers peut '
    'héberger un actif ET l''infogérer, et ce sont deux engagements contractuels '
    'différents — les confondre rendrait le registre DORA faux d''une ligne. Liaison '
    'cloisonnée par ses DEUX parents, comme actif_risques : un actif de Toulouse ne peut '
    'pas pointer un prestataire de Hambourg, et c''est une arête inter-filiales que rien '
    'd''autre ne verrait.';

-- =====================================================================================
-- §4 — `type_entite` GAGNE UNE VALEUR
-- -------------------------------------------------------------------------------------
-- Sans elle, la table est INCRÉABLE : toute création écrit au journal, et
-- `journal_audit.entite_type` porte ce domaine (`CONVENTIONS.md` §40.1).
-- =====================================================================================

do $$
declare
    v_def text;
    v_nom text;
begin
    select pg_get_constraintdef(oid), conname into v_def, v_nom
      from pg_constraint
     where contypid = 'type_entite'::regtype and contype = 'c';
    if v_def is null then
        raise exception 'Le domaine type_entite est introuvable : 062 suppose 001.';
    end if;
    if v_def like '%actif_prestataires%' then
        raise notice 'type_entite porte déjà la valeur de 062.';
    else
        execute 'alter domain type_entite drop constraint ' || quote_ident(v_nom);
        execute 'alter domain type_entite add constraint type_entite_check check ('
             || replace(substring(v_def from 7), ']))',
                        ', ''actif_prestataires''::text]))')
             || ')';
    end if;
end;
$$;

do $$
begin
    if (select pg_get_constraintdef(oid) from pg_constraint
         where contypid = 'type_entite'::regtype and contype = 'c')
       not like '%actif_prestataires%'
    then
        raise exception 'type_entite n''a pas gagné la valeur de 062 : la substitution '
                        'n''a pas mordu, et la table serait INCRÉABLE.';
    end if;
end;
$$;

-- =====================================================================================
-- §5 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Le patron des liaisons : les DEUX extrémités doivent être dans le périmètre. C'est
-- `actif_dependances` (migration `004`) transposé, et c'est ce qui empêche une arête
-- inter-filiales que ni une clé étrangère ni un contrôle applicatif ne verraient.
-- =====================================================================================

alter table actif_prestataires enable row level security;
alter table actif_prestataires force  row level security;

drop policy if exists pol_actif_prestataires_lecture     on actif_prestataires;
drop policy if exists pol_actif_prestataires_ajout       on actif_prestataires;
drop policy if exists pol_actif_prestataires_maj         on actif_prestataires;
drop policy if exists pol_actif_prestataires_suppression on actif_prestataires;

create policy pol_actif_prestataires_lecture on actif_prestataires for select
    using (
        exists (select 1 from actifs a
                 where a.id = actif_prestataires.actif_id
                   and a.filiale_id = any (f_filiales_autorisees()))
        and exists (select 1 from prestataires p
                     where p.id = actif_prestataires.prestataire_id
                       and p.filiale_id = any (f_filiales_autorisees())));

create policy pol_actif_prestataires_ajout on actif_prestataires for insert
    with check (
        exists (select 1 from actifs a
                 where a.id = actif_prestataires.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from prestataires p
                     where p.id = actif_prestataires.prestataire_id
                       and p.filiale_id = f_filiale_ecriture()));

create policy pol_actif_prestataires_maj on actif_prestataires for update
    using (
        exists (select 1 from actifs a
                 where a.id = actif_prestataires.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from prestataires p
                     where p.id = actif_prestataires.prestataire_id
                       and p.filiale_id = f_filiale_ecriture()))
    with check (
        exists (select 1 from actifs a
                 where a.id = actif_prestataires.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from prestataires p
                     where p.id = actif_prestataires.prestataire_id
                       and p.filiale_id = f_filiale_ecriture()));

create policy pol_actif_prestataires_suppression on actif_prestataires for delete
    using (
        exists (select 1 from actifs a
                 where a.id = actif_prestataires.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from prestataires p
                     where p.id = actif_prestataires.prestataire_id
                       and p.filiale_id = f_filiale_ecriture()));

comment on policy pol_actif_prestataires_lecture on actif_prestataires is
    'Les DEUX extrémités doivent être lisibles. Une seule aurait suffi à dessiner une '
    'arête entre un actif de Toulouse et un prestataire de Hambourg — que ni la clé '
    'étrangère, ni un contrôle applicatif ne verraient (motif de actif_dependances).';

grant select, insert, update, delete on actif_prestataires to grc_app;
grant select on actif_prestataires to grc_lecture;

do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Traçabilité à l''insertion : % table(s) équipée(s).', v_poses;
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s).', v_poses;
end;
$$;
select f_armer_declencheurs();

-- =====================================================================================
-- §6 — LE REGISTRE DE L'ARTICLE 30 DU PRODUIT LUI-MÊME
-- -------------------------------------------------------------------------------------
-- ⚠️ **Aucune de ces colonnes ne porte de donnée personnelle**, et c'est une réponse
-- franche plutôt qu'une facilité : un lien entre deux actifs décrit une INFRASTRUCTURE,
-- et les trois vocabulaires sont clos. Le registre existe pour forcer la question, pas
-- pour obtenir une réponse convenue.
-- =====================================================================================

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('actif_dependances', 'delai_impact', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : combien de temps l''actif source tient sans sa cible.'),
  ('actif_dependances', 'mode_degrade', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : un fonctionnement dégradé existe-t-il sans la cible.'),
  ('actif_prestataires', 'actif_id', 'non_personnelle', null, null, null, null,
   'Référence à un actif : une INFRASTRUCTURE, pas une personne.'),
  ('actif_prestataires', 'prestataire_id', 'non_personnelle', null, null, null, null,
   'Référence à un tiers : une ORGANISATION. Les personnes d''un prestataire vivent '
   'dans « prestataires », qui est déjà au registre.'),
  ('actif_prestataires', 'nature', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : ce que le tiers fait de cet actif.'),
  ('actif_prestataires', 'cree_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  -- ⚠️ « personnelle » exige un RÉGIME COMPLET : finalité, base légale, durée et sort
  --    à l'expiration vont ensemble (`ck_colonnes_personnelles_regime`). Le registre
  --    accepte « non personnelle » ; il n'accepte pas une réponse à moitié.
  ('actif_prestataires', 'cree_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier.',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma (ISO 27001 A.8.15).')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §6 bis — LE REGISTRE TECHNIQUE RANGE LA TABLE NEUVE
-- -------------------------------------------------------------------------------------
-- ⚠️ `f_verifier_registres_techniques()` DÉCOUVRE toute table sans `filiale_id` et exige
-- qu'elle soit rangée : « registre technique » que seul le déploiement écrit, ou « écrite
-- par l'application » dont l'écriture est tenue par une politique RLS. **Ne pas répondre
-- n'est pas une option** — c'est ce qu'a fait la `026` pour `colonnes_personnelles`, qui
-- AFFIRMAIT dans un commentaire ce que rien ne tenait (constat **Q-291**).
--
-- **La décision : écrite par l'APPLICATION.** Déclarer qui exploite un actif est un geste
-- de saisie courante. Et c'est une LIAISON : elle se cloisonne par ses DEUX parents, ce
-- qui est plus strict qu'un `filiale_id`.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_registres_techniques()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
        'processus_actifs', 'risque_exigences', 'import_erreurs',
        -- AJOUTÉE PAR 044 : niveau Groupe, écriture tenue par une politique RLS
        -- (f_administration_groupe), jamais par les privilèges.
        'campagnes',
        -- ── AJOUTÉES PAR 060, ET C'EST UNE DÉCISION ──────────────────────────
        -- Écrites par l'APPLICATION, pas par le déploiement : ouvrir une revue,
        -- décider ligne à ligne et la clore sont des gestes d'administrateur, faits
        -- depuis le produit. Leur écriture est donc tenue par une politique RLS
        -- (f_administration_groupe), jamais par les privilèges — et le rôle
        -- applicatif y a bien les quatre verbes, contrairement à un registre.
        'revues_habilitations',
        'revue_habilitation_lignes',
        -- ── AJOUTÉE PAR 062, ET C'EST UNE DÉCISION ───────────────────────────
        -- Écrite par l'APPLICATION : déclarer qui exploite un actif est un geste de
        -- saisie courante, fait depuis la fiche de l'actif. C'est une LIAISON, comme
        -- `actif_risques` ou `processus_actifs` : elle ne porte pas de `filiale_id` à
        -- elle et se cloisonne par ses DEUX parents — ce qui est plus strict qu'un
        -- `filiale_id`, puisque les deux extrémités doivent être dans le périmètre.
        'actif_prestataires'
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
$function$;

-- =====================================================================================
-- §7 — LE GARDE-FOU — IL ÉPROUVE, IL NE RECONNAÎT PAS UN MOT
-- -------------------------------------------------------------------------------------
-- Quatre propriétés, et chacune ferme un défaut qui ne se verrait PAS à l'usage :
--
--  1. les HUIT types sont acceptés, et un type inventé est refusé — éprouvé sur le
--     prédicat RÉEL, jamais sur le texte de la contrainte (constat **Q-312**) ;
--  2. les deux qualificatifs acceptent `null` — sans quoi les dépendances saisies avant
--     la 062 deviendraient inécrivables, et une fiche d'actif refuserait d'enregistrer
--     sans que personne comprenne pourquoi ;
--  3. un délai ou un mode dégradé INVENTÉ est refusé — un vocabulaire ouvert rendrait la
--     chronologie inexploitable ;
--  4. `actif_prestataires` porte ses quatre politiques, et sa clé primaire porte la
--     NATURE — sans elle, un tiers qui héberge ET infogère un actif ne pourrait déclarer
--     qu'un des deux, et le registre DORA serait faux d'une ligne.
--
-- ⚠️ **Il n'écrit RIEN** : `f_verifier_schema()` est `stable`, et c'est ce qui l'empêche
-- d'agir sur ce qu'il inspecte (`CONVENTIONS.md` §39.8, leçon payée à la `060`).
-- =====================================================================================

create or replace function f_verifier_dependances_actifs()
returns table(objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_verdict boolean;
    v_type    text;
    v_manque  text[] := array[]::text[];
    -- Les huit types, nommés UN PAR UN. ⚠️ Un garde de CLASSE — « la contrainte
    -- existe » — ne voit pas la disparition d'une VALEUR : c'est le constat **Q-313**,
    -- et c'est exactement ce qui arriverait si quelqu'un retirait `administre_par` en
    -- croyant simplifier. La carte cesserait alors de montrer le chemin d'un attaquant,
    -- sans qu'aucun essai rougisse.
    v_types constant text[] := array[
        'dep', 'hosted', 'flux', 'backup',
        'authentifie_par', 'administre_par', 'transite_par', 'redonde_par'];
begin
    -- ── (1) LES HUIT TYPES SONT ACCEPTÉS, UN PAR UN ────────────────────────────────
    foreach v_type in array v_types loop
        v_verdict := f_contrainte_accepte('actif_dependances', 'ck_actif_dependances_type',
                                          jsonb_build_object('type', v_type));
        if v_verdict is null then
            objet    := 'actif_dependances';
            anomalie := 'contrainte_type_non_mesurable';
            detail   := 'ck_actif_dependances_type est absente, ou son prédicat appelle '
                        'une fonction que ce garde refuse d''évaluer (constat A-4)';
            return next;
            exit;
        elsif not v_verdict then
            v_manque := v_manque || v_type;
        end if;
    end loop;
    if array_length(v_manque, 1) > 0 then
        objet    := 'actif_dependances';
        anomalie := 'type_de_lien_disparu';
        detail   := format('ces natures de lien ne sont plus acceptées : %s. La carte '
                           'cesserait de montrer ce qu''elles décrivent — et rien ne le '
                           'dirait, les liens existants restant en base',
                           array_to_string(v_manque, ', '));
        return next;
    end if;

    -- ── (1 bis) LE CONTRE-TÉMOIN ───────────────────────────────────────────────────
    -- Un garde qui n'éprouve que des acceptations est muet sur une contrainte devenue
    -- « true » — c'est-à-dire sur un vocabulaire ouvert, où « heberge_peut_etre »
    -- entrerait. C'est la moitié qui manque le plus souvent (constat Q-210).
    v_verdict := f_contrainte_accepte('actif_dependances', 'ck_actif_dependances_type',
                                      jsonb_build_object('type', 'lien_invente'));
    if v_verdict then
        objet    := 'actif_dependances';
        anomalie := 'vocabulaire_des_liens_ouvert';
        detail   := 'un type de lien INVENTÉ est accepté : la cartographie ignore ce '
                    'qu''elle ne connaît pas, et le lien disparaîtrait du graphe sans '
                    'un mot — saisi, stocké, invisible';
        return next;
    end if;

    -- ── (2) LES DEUX QUALIFICATIFS ACCEPTENT « null » ──────────────────────────────
    --
    -- ⚠️ Sans cela, les dépendances saisies AVANT la 062 deviendraient inécrivables :
    -- une fiche d'actif refuserait d'enregistrer, et le message ne désignerait rien.
    -- C'est le motif du constat Q-192 — une colonne neuve ne fait pas dire aux données
    -- anciennes ce que personne n'a dit.
    for v_type in select unnest(array['delai_impact', 'mode_degrade']) loop
        v_verdict := f_contrainte_accepte(
            'actif_dependances',
            'ck_actif_dependances_' ||
                case when v_type = 'delai_impact' then 'delai' else 'degrade' end,
            jsonb_build_object(v_type, null));
        if v_verdict is not null and not v_verdict then
            objet    := 'actif_dependances';
            anomalie := 'qualificatif_obligatoire';
            detail   := format('« %s » refuse la valeur nulle : les dépendances saisies '
                               'avant la 062 deviendraient inécrivables, et une fiche '
                               'd''actif refuserait d''enregistrer sans désigner la '
                               'cause', v_type);
            return next;
        end if;
    end loop;

    -- ── (3) UN DÉLAI OU UN MODE INVENTÉ EST REFUSÉ ─────────────────────────────────
    v_verdict := f_contrainte_accepte('actif_dependances', 'ck_actif_dependances_delai',
                                      jsonb_build_object('delai_impact', 'un_certain_temps'));
    if v_verdict then
        objet    := 'actif_dependances';
        anomalie := 'delai_ouvert';
        detail   := 'un délai d''impact INVENTÉ est accepté : la chronologie cesse d''être '
                    'comparable, et c''est tout ce que ce champ apporte';
        return next;
    end if;
    v_verdict := f_contrainte_accepte('actif_dependances', 'ck_actif_dependances_degrade',
                                      jsonb_build_object('mode_degrade', 'ça dépend'));
    if v_verdict then
        objet    := 'actif_dependances';
        anomalie := 'mode_degrade_ouvert';
        detail   := 'un mode dégradé INVENTÉ est accepté : « vital » et « de confort » '
                    'cessent de se distinguer';
        return next;
    end if;

    -- ── (4) LE LIEN VERS UN TIERS ──────────────────────────────────────────────────
    if to_regclass('public.actif_prestataires') is null then
        objet    := 'actif_prestataires';
        anomalie := 'table_absente';
        detail   := 'le lien entre un actif et son exploitant est la dépendance la plus '
                    'contrôlée par NIS2 et DORA ; sans cette table, elle est saisie deux '
                    'fois dans deux écrans qui ne se parlent pas';
        return next;
    else
        -- ⚠️ La NATURE dans la clé primaire : sans elle, un tiers qui héberge ET
        -- infogère un actif ne peut déclarer qu'un des deux, et le registre DORA est
        -- faux d'une ligne. Mesuré sur les COLONNES de l'index, jamais sur son nom.
        if not exists (
            select 1 from pg_index i
              join pg_class c on c.oid = i.indexrelid
              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
             where c.relname = 'pk_actif_prestataires' and a.attname = 'nature')
        then
            objet    := 'actif_prestataires';
            anomalie := 'nature_hors_cle';
            detail   := 'la clé primaire ne porte pas « nature » : un tiers qui héberge '
                        'ET infogère un actif ne pourrait déclarer qu''un des deux, et le '
                        'registre d''information DORA serait faux d''une ligne';
            return next;
        end if;

        if (select count(*) from pg_policy where polrelid = 'actif_prestataires'::regclass
                                             and polpermissive) < 4
        then
            objet    := 'actif_prestataires';
            anomalie := 'politiques_incompletes';
            detail   := 'moins de quatre politiques permissives : une arête entre un '
                        'actif et un prestataire d''une AUTRE filiale passerait — ce que '
                        'ni la clé étrangère ni un contrôle applicatif ne verraient';
            return next;
        end if;
    end if;
end;
$$;

comment on function f_verifier_dependances_actifs() is
    'Garde-fou de la 062 : les HUIT natures de lien sont nommées UNE PAR UNE et '
    'SOUMISES au prédicat réel (un garde de CLASSE ne voit pas la disparition d''une '
    'VALEUR — constat Q-313) ; un type inventé est refusé, et c''est le CONTRE-TÉMOIN '
    'sans lequel un vocabulaire ouvert passerait au vert ; les deux qualificatifs '
    'acceptent « null », sans quoi les dépendances d''avant la 062 deviendraient '
    'inécrivables ; et la clé primaire du lien vers un tiers porte la NATURE, mesurée '
    'sur les COLONNES de l''index et non sur son nom.';

grant execute on function f_verifier_dependances_actifs() to grc_app;

-- =====================================================================================
-- §8 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select count(*), string_agg(format('%s/%s: %s', objet, anomalie, detail), ' | ')
      into v_nombre, v_anomalies
      from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 062 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, dépendances enrichies comprises.';
end;
$$;

insert into migrations_schema (version, nom)
values ('062', 'les dépendances entre actifs disent le terrain : quatre natures de lien de '
               'plus — annuaire, administration, transit, redondance —, deux qualificatifs '
               'qui transforment le rayon d''impact en CHRONOLOGIE, et le lien vers le '
               'tiers qui exploite l''actif (NIS2 art. 21, DORA art. 28)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_dependances_actifs();
--   delete from controles_schema where fonction = 'f_verifier_dependances_actifs';
--   drop table if exists actif_prestataires;
--   alter table actif_dependances drop column if exists delai_impact;
--   alter table actif_dependances drop column if exists mode_degrade;
--   alter table actif_dependances drop constraint if exists ck_actif_dependances_type;
--   alter table actif_dependances add constraint ck_actif_dependances_type
--       check (type in ('dep', 'hosted', 'flux', 'backup'));
--   delete from colonnes_personnelles where table_nom = 'actif_prestataires';
--   delete from colonnes_personnelles where table_nom = 'actif_dependances'
--         and colonne in ('delai_impact', 'mode_degrade');
--   delete from migrations_schema where version = '062';
--   commit;
-- ⚠️ **L'annulation ÉCHOUE si des liens des quatre natures neuves existent** — et c'est
--    voulu : la contrainte d'origine les refuserait, et les retirer silencieusement
--    effacerait la carte du chemin d'un attaquant. Retirez-les d'abord, en sachant ce
--    que vous retirez.
-- =====================================================================================
