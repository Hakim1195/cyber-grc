-- =====================================================================================
--  035 — LES DÉROGATIONS DATÉES : ACCEPTER UN ÉCART, MAIS PAS POUR TOUJOURS
--
--  §0  Le périmètre de la migration
--  §1  La table « derogations »
--  §2  L'ÉTAT est DÉRIVÉ, à un seul endroit : f_etat_derogation()
--  §3  Le circuit d'approbation du lot L8 s'ouvre à la dérogation
--  §4  Cloisonnement : RLS activée, forcée, quatre politiques
--  §5  Le garde-fou — il ÉPROUVE la dérivation, il ne lit pas son texte
--  §6  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Action **19.2** du `docs/PLAN_PRODUIT.md` : *« dérogations datées — propriétaire,
--  motif, échéance, approbation par le circuit L8 existant. Une dérogation échue
--  **redevient une non-conformité**, sans intervention »*. Et le critère nomme la
--  contrainte de conception : *« l'échéance est DÉRIVÉE, jamais recopiée : le calcul vit
--  à un seul endroit »*.
--
--  ── CE QU'UNE DÉROGATION EST, ET CE QU'ELLE N'EST PAS ──────────────────────────────
--
--  Toute organisation réelle porte des écarts assumés : un serveur qui ne peut pas être
--  mis à jour avant le renouvellement de la ligne de production, un compte partagé que
--  l'automate du fournisseur exige. L'ISO 27001 ne l'interdit pas — elle demande que
--  l'écart soit **décidé**, **motivé**, **porté par quelqu'un** et **borné dans le temps**.
--
--  Une dérogation est donc quatre choses ensemble, et elle n'existe que si les quatre
--  sont là : un propriétaire, un motif, une échéance, et une décision d'approbation.
--
--  ⚠️ **Ce n'est PAS un statut de conformité.** L'exigence reste « non conforme » ; la
--  dérogation dit seulement que l'organisation en répond jusqu'à telle date.
--
--  ── ⚠️ LA DÉCISION CENTRALE : ON N'ÉCRIT JAMAIS DANS `exigences` ────────────────────
--
--  La pente naturelle était de poser `exigences.statut_conformite = 'non applicable'`
--  pendant la dérogation, puis de le remettre à l'échéance. Elle est **refusée**, et le
--  motif tient en une phrase : *il faudrait que quelqu'un, ou quelque chose, repasse.*
--
--  Un traitement nocturne qui « remet à non conforme » est un traitement qui peut ne pas
--  tourner — et le jour où il ne tourne pas, le produit affirme une conformité qui n'existe
--  plus, dans un outil qui sert de preuve en audit. Pire : il l'affirme **en silence**.
--
--  Ici, rien ne se remet à rien. L'état d'une dérogation est **calculé à la lecture**, en
--  comparant son échéance à la date du jour. Une dérogation échue cesse de couvrir à
--  l'instant même où le jour change, sans qu'aucun code ne s'exécute, sans minuteur, sans
--  file d'attente, et sans qu'on puisse l'oublier. *L'absence de traitement n'est pas une
--  économie : c'est la garantie.*
--
--  C'est exactement le motif de `f_echeances_reglementaires()` (migration `034`), et celui
--  de `PraMcoModule.isEnRetard` côté navigateur, que le critère 19.2 cite nommément.
--
--  ── LE CIRCUIT D'APPROBATION N'EST PAS RÉÉCRIT ─────────────────────────────────────
--
--  Une dérogation s'approuve par le circuit du lot **L8**, celui qui porte déjà les
--  politiques, les risques résiduels et les rapports d'audit. On ajoute un quatrième
--  `objet_type`, et **rien d'autre** : l'irréversibilité d'une décision, la péremption
--  par empreinte, le journal, le cloisonnement — tout est déjà écrit, éprouvé, et audité.
--
--  ⚠️ Les deux étapes sont `proposition` puis `acceptation`, **les mêmes que le risque**,
--  et le vocabulaire `ck_approbations_etape` les admet déjà : accepter une dérogation EST
--  accepter un risque résiduel, nommément et pour une durée. Inventer deux étapes de plus
--  aurait donné deux noms à un seul geste.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 035_les_derogations_datees.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §3 REMPLACE une contrainte de `approbations`, ce qui la VALIDE contre les lignes
-- existantes ; `force row level security` vaut pour le propriétaire. Sans périmètre, la
-- validation ne verrait qu'une partie des lignes — ou échouerait en `GRC04` sans nommer
-- sa cause. Motif du §0 de la `012` : on déclare le groupe ENTIER, jamais une filiale.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-035', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LA TABLE « derogations »
-- =====================================================================================

create table if not exists derogations (
    id             id_metier   not null default f_generer_id('DER'),
    -- ⚠️ TOUJOURS locale, et `not null`. Une dérogation de portée Groupe voudrait dire
    -- « le Groupe accepte que ses vingt filiales soient en écart », ce qui n'est pas une
    -- dérogation mais un changement de politique. Et `exigences` est elle-même une table
    -- purement locale : il n'y a pas de sens à ouvrir ce qui n'existe pas en face.
    filiale_id     id_metier   not null,
    exigence_id    id_metier   not null,

    -- ── Les quatre pièces sans lesquelles une dérogation n'en est pas une ──────────
    proprietaire   text        not null,
    motif          text        not null,
    accordee_le    date        not null default current_date,
    echeance       date        not null,

    -- Ce qu'on fait EN ATTENDANT. Facultatif : toutes les dérogations n'admettent pas de
    -- compensation, et prétendre le contraire pousserait à en inventer une.
    compensation   text,

    version        integer     not null default 1,
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    modifie_le     timestamptz,
    modifie_par    text,

    constraint pk_derogations primary key (id),

    -- ⚠️ La clé étrangère est COMPOSITE — `CONVENTIONS.md` §17.1. Une clé simple sur
    -- `exigence_id` serait satisfaite par une exigence INVISIBLE de la filiale voisine :
    -- les contrôles d'intégrité de PostgreSQL contournent délibérément la RLS. On
    -- pourrait alors dériver à une exigence qu'on ne voit pas, et la voisine qui la
    -- supprimerait détruirait ici une dérogation qu'elle ignore.
    constraint fk_derogations_exigence
        foreign key (exigence_id, filiale_id) references exigences (id, filiale_id)
        on delete cascade,
    constraint fk_derogations_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- Cible des clés étrangères composites à venir (`CONVENTIONS.md` §19.1).
    constraint uq_derogations_id_filiale unique (id, filiale_id),

    -- ⚠️ **Aucune unicité sur (exigence_id, filiale_id)**, et c'est une DÉCISION écrite.
    --
    -- Une exigence porte plusieurs dérogations au fil des ans, et les garder est tout
    -- l'intérêt : *« cet écart a été reconduit trois fois »* est précisément ce qu'un
    -- auditeur vient chercher, et une table qui écraserait la précédente le lui cacherait.
    --
    -- ⚠️ **On n'interdit pas non plus deux dérogations en vigueur EN MÊME TEMPS**, et le
    -- motif mérite d'être lu plutôt que redécouvert. Trois voies ont été pesées :
    --
    --   · une **unicité partielle** « where echeance >= current_date » — PostgreSQL la
    --     refuse : un prédicat d'index doit être IMMUTABLE, et `current_date` ne l'est
    --     pas. Ce n'est pas un contournement à chercher, c'est la bonne raison : un index
    --     dont la vérité change à minuit cesserait d'être un index ;
    --   · un **déclencheur** qui refuserait la seconde — il ferait échouer la REPRISE
    --     d'un export contenant deux dérogations qui se chevauchent, c'est-à-dire qu'il
    --     rendrait le produit incapable de relire sa propre sauvegarde. C'est la classe du
    --     constat Q-194, et elle a déjà coûté un passage de porte ;
    --   · **ne rien interdire**, et DIRE laquelle gouverne. C'est la voie retenue : la
    --     dérogation qui couvre est celle dont l'échéance est la plus lointaine parmi
    --     celles « en_vigueur », et les autres se lisent en dessous, à leur date.
    --
    -- Deux dérogations qui se chevauchent ne produisent d'ailleurs aucune ambiguïté :
    -- l'écart est couvert jusqu'à la plus lointaine des deux. Interdire aurait coûté une
    -- capacité réelle — proroger un écart avant l'échéance du précédent — pour fermer un
    -- désordre qui n'a pas de conséquence.

    constraint ck_derogations_proprietaire check (proprietaire <> ''),
    constraint ck_derogations_motif        check (motif <> ''),
    -- Une dérogation qui expire avant d'être accordée n'a jamais rien couvert.
    constraint ck_derogations_echeance     check (echeance >= accordee_le),
    -- Bornes de saisie — contrôle S13. Une collection non bornée est une voie de déni
    -- de service applicatif autant qu'un champ mal rempli.
    constraint ck_derogations_longueurs    check (
        length(proprietaire) <= 200
        and length(motif) <= 4000
        and (compensation is null or length(compensation) <= 4000))
);

comment on table derogations is
    'Écart de conformité ASSUMÉ, borné dans le temps (action 19.2). Quatre pièces '
    'indissociables : un propriétaire, un motif, une échéance, et une décision du circuit '
    'L8. ⚠️ Cette table n''écrit JAMAIS dans « exigences » : l''exigence reste non '
    'conforme, la dérogation dit seulement qui en répond et jusqu''à quand. L''état se '
    'DÉRIVE à la lecture (f_etat_derogation) — aucun traitement ne « remet » quoi que ce '
    'soit, donc aucun traitement ne peut oublier de le faire.';

comment on column derogations.echeance is
    'Jusqu''à quand l''écart est assumé. ⚠️ Elle n''est JAMAIS recopiée ailleurs : '
    'f_etat_derogation() est le seul endroit qui la compare à la date du jour. Une '
    'seconde comparaison — dans une requête, dans le navigateur — divergerait au premier '
    'ajustement, et deux comptes de la même échéance est ce qu''un outil produit en audit '
    'ne peut pas se permettre.';

comment on column derogations.compensation is
    'Ce qui est fait EN ATTENDANT — surveillance renforcée, restriction d''accès. '
    'Facultatif à dessein : toutes les dérogations n''admettent pas de compensation, et '
    'l''exiger pousserait à en inventer une.';

create index ix_derogations_filiale_echeance on derogations (filiale_id, echeance);
create index ix_derogations_exigence         on derogations (exigence_id, filiale_id);

-- Le registre de l'article 30 réclame une décision pour CHAQUE colonne (constat Q-295),
-- et il la réclame complète pour toute colonne « personnelle » (constat Q-296).
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('derogations', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('derogations', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('derogations', 'exigence_id', 'non_personnelle', null, null, null, null,
   'Identifiant de l''exigence dérogée.'),
  ('derogations', 'proprietaire', 'personnelle',
   'Savoir qui répond d''un écart de conformité assumé, et à qui s''adresser avant son échéance.',
   'Intérêt légitime',
   1095,
   'anonymiser',
   'Nom saisi librement, souvent repris de l''annuaire — idem actifs.responsable. '
   'Anonymisé à l''expiration : la dérogation garde tout son sens pour un auditeur sans '
   'nommer qui en répondait il y a trois ans.'),
  ('derogations', 'motif', 'personnelle',
   'Justifier l''écart : c''est la pièce qu''un auditeur lit en premier.',
   'Intérêt légitime',
   1095,
   'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom peut figurer au milieu '
   'd''une phrase (« en attendant le départ de X »). Le remplacer détruirait la phrase — '
   'et cette phrase est une preuve. D''où le régime « signaler » : le produit montre '
   'l''emplacement à un humain au lieu d''effacer.'),
  ('derogations', 'compensation', 'personnelle',
   'Décrire ce qui est fait en attendant la remise en conformité.',
   'Intérêt légitime',
   1095,
   'signaler',
   'Idem derogations.motif : saisie libre dont le sujet n''est pas une personne.'),
  ('derogations', 'accordee_le', 'non_personnelle', null, null, null, null,
   'Date d''octroi : une date de gestion, elle ne désigne personne.'),
  ('derogations', 'echeance', 'non_personnelle', null, null, null, null,
   'Date d''expiration : une date de gestion, elle ne désigne personne.')
on conflict (table_nom, colonne) do nothing;

-- La marque de provenance (migration `032`). La table naissant APRÈS elle, son balayage
-- ne peut pas l'avoir vue : on la rattrape ici, sinon le déploiement rougit.
alter table derogations
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_derogations_provenance on derogations;
create trigger trg_derogations_provenance before insert on derogations
    for each row execute function f_marquer_provenance();
alter table derogations enable always trigger trg_derogations_provenance;

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('derogations', 'provenance', 'non_personnelle',
        'Vocabulaire clos ou valeur technique : d''où vient la ligne (saisie / decouverte / '
        'reprise), posée par la migration 032. Ne désigne aucune personne.')
on conflict (table_nom, colonne) do nothing;

-- ⚠️ **On APPELLE l'installateur, on ne recopie pas son déclencheur.**
-- `f_poser_tracabilite_insertion()` (migration `001`) découvre dans le catalogue toutes
-- les tables portant `cree_par` et leur pose ce qu'il faut.
select f_poser_tracabilite_insertion();

-- Et la MISE À JOUR : sans « before update », `version` cesse d'être un compteur et le
-- verrouillage optimiste — le risque P1 du projet — devient décoratif (§18.1).
drop trigger if exists trg_derogations_maj on derogations;
create trigger trg_derogations_maj before update on derogations
    for each row execute function f_maj_tracabilite();
alter table derogations enable always trigger trg_derogations_maj;

-- =====================================================================================
-- §2 — L'ÉTAT EST DÉRIVÉ, À UN SEUL ENDROIT
-- =====================================================================================
-- ⚠️ **Un seul endroit**, et c'est celui-ci. La route l'appelle, le garde-fou du §5
-- l'éprouve, et l'écran affiche ce qu'elle rend. Une seconde rédaction — un `case` dans
-- une requête, une comparaison de dates dans le navigateur — se mettrait à diverger au
-- premier ajustement.
--
-- ── La décision du circuit entre en ARGUMENT, et voici pourquoi ────────────────────
--
-- L'état d'un circuit d'approbation (en cours / complet / refusé / périmé) est dérivé par
-- `src/approbations/circuit.ts`, qui connaît l'ORDRE des étapes — un savoir que le schéma
-- ne porte pas, et qu'il serait faux de recopier ici. Cette fonction ne le recalcule donc
-- pas : elle le reçoit. Ce qu'elle tient, et qu'elle est seule à tenir, c'est la règle du
-- TEMPS — et c'est celle que le critère 19.2 demande d'unifier.
--
-- `stable` et non `immutable` : elle lit `current_date`.

create or replace function f_etat_derogation(
    p_echeance  date,
    p_decision  text     -- 'approuve' | 'refuse' | null (pas encore tranché)
)
returns text
    language sql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        -- Refusée : elle n'a jamais couvert, et son échéance n'y change rien.
        when p_decision = 'refuse'   then 'refusee'
        -- Pas encore tranchée : elle ne couvre PAS. ⚠️ C'est le sens qui compte — une
        -- dérogation proposée mais non acceptée laisse l'écart entièrement découvert, et
        -- l'écran doit le dire. Le contraire ferait d'une simple saisie un blanc-seing.
        when p_decision is distinct from 'approuve' then 'en_attente'
        when p_echeance < current_date then 'echue'
        else 'en_vigueur'
    end;
$$;

comment on function f_etat_derogation(date, text) is
    'L''état d''une dérogation, DÉRIVÉ de son échéance et de la décision du circuit L8 — '
    'jamais stocké. Quatre valeurs : refusee, en_attente, echue, en_vigueur. ⚠️ Seule '
    '« en_vigueur » COUVRE l''écart. Une dérogation échue redevient une non-conformité à '
    'l''instant où le jour change, sans qu''aucun traitement ne s''exécute — donc sans '
    'qu''aucun traitement ne puisse oublier de le faire (action 19.2).';

-- =====================================================================================
-- §3 — LE CIRCUIT D'APPROBATION S'OUVRE À LA DÉROGATION
-- =====================================================================================
-- On ajoute un quatrième `objet_type`, et RIEN d'autre. L'irréversibilité, la péremption
-- par empreinte, le journal et le cloisonnement sont déjà écrits et audités (lot L8).
--
-- ⚠️ Le vocabulaire est fermé DES DEUX CÔTÉS : cette contrainte fait FACE au type
-- `ObjetApprouvable` de `src/approbations/circuit.ts`. Une valeur présente d'un seul côté
-- fait échouer l'insertion en 23514 — c'est le comportement voulu, dans les deux sens.
--
-- On vérifie d'abord que la contrainte EXISTE : cette migration en REMPLACE une, elle
-- n'en crée pas. Sans ce garde, une contrainte disparue serait recréée en silence et le
-- remplacement deviendrait une création (motif du §0 de la `009`).

do $$
begin
    if not exists (
        select 1 from pg_constraint k
          join pg_class c on c.oid = k.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'approbations'
           and k.conname = 'ck_approbations_objet' and k.contype = 'c')
    then
        raise exception
            'ck_approbations_objet est introuvable sur approbations : cette migration '
            'REMPLACE une contrainte, elle n''en crée pas une.'
            using hint = 'Voir 001_socle.sql §12, CONVENTIONS.md §33.3.';
    end if;
end;
$$;

-- Une SEULE instruction : PostgreSQL retire et repose dans la même opération, et VALIDE
-- la nouvelle contre les lignes existantes. Il n'existe donc aucun instant — pas même
-- dans cette transaction — où la table accepterait un objet hors vocabulaire.
alter table approbations
    drop constraint ck_approbations_objet,
    add  constraint ck_approbations_objet check (objet_type in (
        'document', 'risque', 'audit',
        -- ── Lot L19, action 19.2 ───────────────────────────────────────────────────
        -- Ses deux étapes sont « proposition » puis « acceptation », déjà admises par
        -- ck_approbations_etape : accepter une dérogation EST accepter un risque
        -- résiduel, nommément et pour une durée. Deux étapes de plus auraient donné
        -- deux noms à un seul geste.
        'derogation'));

comment on constraint ck_approbations_objet on approbations is
    'Vocabulaire fermé des objets soumis au circuit d''approbation. Trois valeurs depuis '
    '001_socle.sql (document, risque, audit) ; « derogation » par la 035 (action 19.2). '
    'Elle fait FACE au type ObjetApprouvable de src/approbations/circuit.ts : une valeur '
    'présente d''un seul côté fait échouer l''insertion en 23514, ce qui est le '
    'comportement voulu — dans les deux sens, l''omission crie.';

-- =====================================================================================
-- §3 bis — LE DOMAINE « type_entite » ADMET LA TABLE, SANS QUOI ELLE EST INCRÉABLE
-- =====================================================================================
-- ⚠️ **Le piège est documenté depuis la migration `013`, et il a été retendu ici.**
-- `journal_audit.entite_type` porte le domaine `type_entite`, dont le `check` énumère les
-- entités désignables. Or **toute création écrit une entrée au journal** : une table
-- absente du domaine est donc, très exactement, INCRÉABLE — et le refus arrive à
-- l'utilisateur en `400 « Une valeur de l'enregistrement n'est pas admise »`, qui ne
-- désigne rien, parce que `type_entite_check` n'est pas un `ck_<table>_<sujet>` et ne se
-- traduit pas en vocabulaire métier.
--
-- Mesuré, et pas supposé : c'est le balayage de `test/api/entites-familles.test.mjs`
-- (« chaque entité se CRÉE par sa route ») qui l'a rendu, exactement comme il l'avait
-- rendu pour `risque_catalogue` à la `013`. *Le même garde, le même défaut, vingt-trois
-- migrations plus tard.*
--
-- ── ON NE RECOPIE PAS LA LISTE, ON LA LIT TELLE QU'ELLE EST APPLIQUÉE ──────────────
--
-- PostgreSQL n'ajoute pas une valeur à un domaine : il faut réécrire la contrainte
-- entière. La `013` l'a fait en recopiant les trente-quatre valeurs — et son propre
-- commentaire dit que *« c'est le genre de duplication qui diverge en silence »*.
--
-- Une troisième copie serait la faute que le `CONVENTIONS.md` proscrit — *on ne remplace
-- pas une fonction (ni une contrainte) dont on n'a lu qu'une partie*. On applique donc le
-- motif du §4 de la `027` : on **lit le prédicat appliqué**, on insère la valeur neuve à
-- côté de celle qui lui sert de modèle, et **on refuse d'agir si le texte a changé**
-- plutôt que d'appliquer de travers.

do $$
declare
    v_predicat text;
    v_neuf     text;
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable : la 001 n''a pas été appliquée, '
                        'et cette migration n''a rien à étendre.';
    end if;
    if position('''derogations''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà « derogations » : rejeu, rien à faire.';
        return;
    end if;
    -- Le modèle : la dernière valeur ajoutée par la `013`. Son absence signifie que le
    -- texte a changé depuis, et l'insertion à l'aveugle est refusée.
    if position('''risque_catalogue''' in v_predicat) = 0 then
        raise exception 'La valeur « risque_catalogue » est introuvable dans le prédicat '
                        'appliqué de type_entite_check : son texte a changé, et la '
                        'substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, '''risque_catalogue''',
                      '''risque_catalogue'', ''derogations''');

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais « derogations ».';
end;
$$;

comment on domain type_entite is
    'Vocabulaire fermé des entités désignables par un rattachement polymorphe — '
    'journal_audit.entite_type, approbations.objet_type, pieces_jointes.entite_type. '
    '⚠️ Une table exposée par la couche générique et ABSENTE d''ici est INCRÉABLE : toute '
    'création écrit au journal. « risque_catalogue » par la 013, « derogations » par la '
    '035. test/base/vocabulaire.test.mjs confronte ce domaine au registre applicatif, les '
    'deux découverts, et rougit dès qu''une entité du produit n''y figure pas.';

-- =====================================================================================
-- §3 ter — L'INSTALLATEUR DES DÉCLENCHEURS « LES PIÈCES SUIVENT LEUR PORTEUR »
-- =====================================================================================
-- ⚠️ **Le garde-fou de la `017` a refusé le déploiement, et il avait raison.** Dès que
-- `type_entite` admet « derogations » (§3 bis), la table devient DÉSIGNABLE par le
-- rattachement polymorphe de `pieces_jointes` — on peut y joindre la lettre du
-- fournisseur qui justifie l'écart. Sans déclencheur, supprimer une dérogation laisserait
-- sa pièce **en base, sur le disque et dans le quota de la filiale**, et
-- `GET /api/pieces/…` continuerait de la délivrer (constats Q-232 / Q-233).
--
-- ── LA POSE DEVIENT UNE FONCTION, ET C'EST LA CORRECTION QUI COMPTE ────────────────
--
-- La `017` faisait cette pose dans un bloc `do $$` anonyme : elle balayait le catalogue
-- une fois, à son heure, et **rien ne la rejouait**. Toute table porteuse née après elle
-- devait donc y penser — ce qui est exactement la forme d'omission que le
-- `CONVENTIONS.md` §19.5 proscrit, sauf qu'ici l'oubli est bruyant (le garde-fou refuse
-- le démarrage) au lieu d'être silencieux. Il aura quand même coûté un déploiement.
--
-- On en fait donc un **installateur appelable**, sur le modèle de
-- `f_poser_tracabilite_insertion()` : les migrations suivantes écriront
-- `select f_poser_declencheurs_pieces();` comme elles écrivent déjà l'autre, et la
-- question ne se posera plus.
--
-- ⚠️ **Le prédicat de découverte est celui de la `017`, à l'identique**, et il n'est pas
-- « amélioré » au passage : c'est lui que `f_verifier_declencheurs_pieces()` (§4 de la
-- `017`) confronte au schéma. Deux prédicats qui divergeraient feraient rougir le garde à
-- chaque démarrage, ou — pire — le feraient taire sur une table réellement démunie.

create or replace function f_poser_declencheurs_pieces()
returns integer
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r        record;
    v_admise boolean;
    v_types  text[];
    v_poses  integer := 0;
begin
    for r in
        select c.oid, c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'id'
                          and a.attnum > 0 and not a.attisdropped)
           and exists (select 1 from pg_policy p
                        where p.polrelid = c.oid and p.polcmd = 'd'
                          and (pg_get_expr(p.polqual, p.polrelid) like '%f_filiale_ecriture%'
                            or pg_get_expr(p.polqual, p.polrelid) like '%f_administration_groupe%'))
         order by c.relname
    loop
        -- L'ADMISSION SE MESURE PAR UN TRANSTYPAGE, jamais en relisant le texte de la
        -- contrainte du domaine : c'est la base elle-même qui répond, et la réponse reste
        -- juste le jour où une migration élargit le domaine (ce qu'ont fait la `013` puis
        -- le §3 bis ci-dessus).
        begin
            execute format('select %L::type_entite', r.relname);
            v_admise := true;
        exception when others then
            v_admise := false;
        end;
        if not v_admise then continue; end if;

        -- Les valeurs de `entite_type` qui désignent CETTE table. Elle porte son propre
        -- nom ; `mesure_catalogue` porte en plus « mesures », parce que l'API scinde
        -- l'entité en deux tables (`PLAN_SERVEUR` §2.2) et continue de l'appeler
        -- « mesures » à la route de dépôt.
        v_types := array[r.relname::text];
        if r.relname = 'mesure_catalogue' then
            v_types := array_append(v_types, 'mesures'::text);
        end if;

        execute format('drop trigger if exists %I on %I',
                       'trg_' || r.relname || '_pieces', r.relname);
        execute format(
            'create trigger %I after delete on %I for each row '
            'execute function f_pieces_suivent_leur_porteur(%s)',
            'trg_' || r.relname || '_pieces', r.relname,
            (select string_agg(quote_literal(t), ', ') from unnest(v_types) t));
        -- « always » : le garde-fou f_verifier_armement() refuse tout autre armement —
        -- un déclencheur désarmable est un garde-fou qu'on peut retirer sans migration.
        execute format('alter table %I enable always trigger %I',
                       r.relname, 'trg_' || r.relname || '_pieces');
        v_poses := v_poses + 1;
    end loop;

    if v_poses = 0 then
        raise exception 'Aucune table porteuse découverte : le prédicat de découverte ne '
                        'reconnaît plus le schéma, et « zéro orpheline » ne voudrait rien '
                        'dire.';
    end if;
    return v_poses;
end;
$$;

comment on function f_poser_declencheurs_pieces() is
    'Installateur : découvre dans le CATALOGUE toute table porteuse — admise par le '
    'domaine type_entite, portant une colonne « id », et dont la politique de suppression '
    'est cloisonnée — et lui pose « trg_<table>_pieces », armé « always ». ⚠️ Idempotent : '
    'une migration qui crée une table porteuse l''APPELLE, comme elle appelle déjà '
    'f_poser_tracabilite_insertion(). La 017 faisait cette pose dans un bloc anonyme, que '
    'rien ne rejouait — toute table née après elle devait y penser, et la 035 ne l''a pas '
    'fait : le garde-fou a refusé le déploiement. Il a eu raison, et c''est pour qu''il '
    'n''ait plus à le faire que cette fonction existe.';

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- =====================================================================================

alter table derogations enable row level security;
alter table derogations force row level security;

create policy pol_derogations_lecture on derogations for select using (
    filiale_id = any (f_filiales_lecture())
);
create policy pol_derogations_ajout on derogations for insert with check (
    filiale_id = f_filiale_ecriture()
);
create policy pol_derogations_maj on derogations for update
    using (filiale_id = f_filiale_ecriture())
    with check (filiale_id = f_filiale_ecriture());
create policy pol_derogations_suppression on derogations for delete using (
    filiale_id = f_filiale_ecriture()
);

-- ⚠️ **LA POSE VIENT ICI, ET PAS AU §3 ter — L'ORDRE EST UNE CONTRAINTE, PAS UN STYLE.**
-- Le prédicat de découverte exige que la politique de SUPPRESSION de la table soit
-- cloisonnée. Appelée avant le §4, la fonction ne voit donc pas `derogations` : elle pose
-- les déclencheurs des autres tables, rend un compte plausible, et laisse la table neuve
-- démunie **sans une erreur**. C'est ce qui s'est produit à la première rédaction, et
-- c'est le garde-fou de la `017` qui l'a dit — deux fois de suite.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

comment on policy pol_derogations_lecture on derogations is
    'Une dérogation est TOUJOURS locale (filiale_id not null) : elle suit le périmètre de '
    'lecture, sans le cas « portée Groupe » que portent les tables mixtes. Une session de '
    'portée Groupe voit donc les dérogations de toutes ses filiales — ce qui est '
    'exactement ce qu''une revue de direction vient chercher.';

-- =====================================================================================
-- §5 — LE GARDE-FOU
-- =====================================================================================
-- ⚠️ Il **ÉPROUVE** la dérivation sur des valeurs témoins au lieu de lire le texte de la
-- fonction — `CONVENTIONS.md` §39.1. Un garde qui se contenterait de vérifier que
-- `f_etat_derogation` « existe » passerait au vert sur une fonction qui rend
-- « en_vigueur » pour tout le monde, c'est-à-dire sur la version qui transforme le
-- produit en distributeur de blancs-seings.
--
-- ⚠️ Et il nomme ses pièces UNE PAR UNE : un garde de CLASSE ne voit pas la disparition
-- d'une PAIRE (§39.7, constat Q-313). La clé étrangère composite en est une.

create or replace function f_verifier_derogations()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_hier   constant date := current_date - 1;
    v_demain constant date := current_date + 1;
    -- Les quatre cas, et ce que chacun tient. ⚠️ Le troisième est celui qui compte : une
    -- échéance dépassée NE COUVRE PLUS, et c'est tout l'objet de l'action 19.2.
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('echeance', v_demain::text, 'decision', 'approuve',
            'attendu', 'en_vigueur',
            'effet', 'une dérogation acceptée et non échue cesserait de couvrir : les '
                     'écarts assumés repasseraient tous en non-conformité, et l''outil '
                     'crierait au loup'),
        jsonb_build_object('echeance', v_hier::text, 'decision', 'approuve',
            'attendu', 'echue',
            'effet', 'UNE DÉROGATION EXPIRÉE CONTINUERAIT DE COUVRIR L''ÉCART. C''est le '
                     'défaut que toute l''action 19.2 existe pour empêcher : une '
                     'non-conformité qui ne revient jamais, dans un outil produit en audit'),
        jsonb_build_object('echeance', v_demain::text, 'decision', null,
            'attendu', 'en_attente',
            'effet', 'une dérogation SAISIE mais non acceptée couvrirait l''écart : la '
                     'simple saisie deviendrait un blanc-seing, et le circuit L8 ne '
                     'servirait plus à rien'),
        jsonb_build_object('echeance', v_demain::text, 'decision', 'refuse',
            'attendu', 'refusee',
            'effet', 'une dérogation REFUSÉE couvrirait l''écart : le refus serait sans '
                     'effet, ce qui est pire que de ne pas demander')
    );
    v_cas_un jsonb;
    v_rendu  text;
    -- Les pièces nommées du §1 et du §3.
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('genre','contrainte','table','derogations',
            'nom','fk_derogations_exigence',
            'effet','le rattachement à l''exigence n''est plus cloisonné : une ligne '
                   'INVISIBLE de la filiale voisine satisfait la clé (CONVENTIONS §17.1), '
                   'et l''on peut déroger à une exigence qu''on ne voit pas'),
        jsonb_build_object('genre','contrainte','table','derogations',
            'nom','ck_derogations_echeance',
            'effet','une dérogation peut expirer AVANT d''être accordée : elle n''aurait '
                   'jamais rien couvert, et l''écran afficherait un état absurde'),
        jsonb_build_object('genre','contrainte','table','derogations',
            'nom','ck_derogations_motif',
            'effet','une dérogation sans motif devient possible — or le motif est la '
                   'pièce qu''un auditeur lit en premier'),
        jsonb_build_object('genre','contrainte','table','derogations',
            'nom','ck_derogations_proprietaire',
            'effet','une dérogation dont personne ne répond devient possible'),
        jsonb_build_object('genre','contrainte','table','approbations',
            'nom','ck_approbations_objet',
            'effet','le vocabulaire des objets approuvables n''est plus fermé : une '
                   'approbation peut viser n''importe quoi, et le circuit cesse de faire '
                   'face au type ObjetApprouvable de src/approbations/circuit.ts')
    );
    v_piece jsonb;
begin
    -- ── 1. La fonction existe-t-elle seulement ? ────────────────────────────────────
    if to_regprocedure('public.f_etat_derogation(date, text)') is null then
        objet    := 'f_etat_derogation';
        anomalie := 'derivation_derogation_absente';
        detail   := 'La fonction qui dit si une dérogation couvre encore a disparu. Sans '
                    'elle, le produit ne sait plus distinguer un écart assumé d''un écart '
                    'oublié — et c''est la seule chose que l''action 19.2 apporte.';
        return next;
        return;
    end if;

    -- ── 2. LA DÉRIVATION EST ÉPROUVÉE, pas lue ──────────────────────────────────────
    for v_cas_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := f_etat_derogation((v_cas_un ->> 'echeance')::date,
                                     v_cas_un ->> 'decision');
        if v_rendu is distinct from (v_cas_un ->> 'attendu') then
            objet    := 'f_etat_derogation';
            anomalie := 'derivation_derogation_fausse';
            detail   := format(
                'Échéance « %s », décision « %s » : la fonction rend « %s » au lieu de '
                '« %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE la dérivation sur '
                'des valeurs témoins — il ne lit pas le texte de la fonction (§39.1).',
                v_cas_un ->> 'echeance',
                coalesce(v_cas_un ->> 'decision', '(aucune)'),
                coalesce(v_rendu, '(null)'),
                v_cas_un ->> 'attendu',
                v_cas_un ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 3. Les pièces nommées ───────────────────────────────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.' || (v_piece ->> 'table'))
               and c.conname = v_piece ->> 'nom'
               -- ⚠️ `convalidated` : une contrainte reposée « not valid » garde son
               -- prédicat et n'a JAMAIS vérifié les lignes déjà en base — constat Q-319.
               and c.convalidated)
        then
            objet    := (v_piece ->> 'table') || '.' || (v_piece ->> 'nom');
            anomalie := 'derogation_piece_manquante';
            detail   := format(
                'Cette pièce de l''action 19.2 a disparu ou n''est pas validée. Ce que sa '
                'disparition rouvre : %s.', v_piece ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 4. Et la table n'écrit JAMAIS dans `exigences` ──────────────────────────────
    --
    -- ⚠️ Mesuré dans le CATALOGUE, pas dans une liste : tout déclencheur posé sur
    -- `derogations` est examiné, et l'on refuse celui dont la fonction touche à
    -- `exigences`. C'est la décision centrale de cette migration — *rien ne se remet à
    -- rien* —, et sans ce contrôle elle tiendrait à la seule bonne volonté du prochain.
    if exists (
        select 1
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = to_regclass('public.derogations')
           and not t.tgisinternal
           and p.prosrc ~* '\mupdate\s+exigences\M')
    then
        objet    := 'derogations';
        anomalie := 'derogation_ecrit_dans_exigences';
        detail   := 'Un déclencheur de « derogations » écrit dans « exigences ». C''est '
                    'exactement ce que l''action 19.2 refuse : dès qu''un traitement doit '
                    'REPASSER pour remettre un statut, il peut ne pas repasser — et le '
                    'jour où il ne repasse pas, le produit affirme une conformité qui '
                    'n''existe plus, en silence, dans un outil qui sert de preuve en '
                    'audit. L''état se DÉRIVE (f_etat_derogation), il ne se pose pas.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_derogations() is
    'Garde-fou de l''action 19.2 : la dérivation de l''état est ÉPROUVÉE sur quatre cas '
    'témoins (§39.1), les cinq pièces du schéma sont nommées UNE PAR UNE (§39.7), et '
    'aucun déclencheur de « derogations » n''écrit dans « exigences ». Découvert par '
    'f_decouvrir_controles_schema().';

-- =====================================================================================
-- §6 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('035', 'les dérogations datées : un écart assumé porte un propriétaire, un motif, '
               'une échéance et une décision du circuit L8 — et son état se DÉRIVE, de '
               'sorte qu''une dérogation échue redevient une non-conformité sans qu''aucun '
               'traitement n''ait à repasser')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_derogations();
--   delete from controles_schema where fonction = 'f_verifier_derogations';
--   drop table if exists derogations;
--   drop function if exists f_etat_derogation(date, text);
--   delete from colonnes_personnelles where table_nom = 'derogations';
--   delete from approbations where objet_type = 'derogation';
--   alter table approbations drop constraint ck_approbations_objet,
--       add constraint ck_approbations_objet
--           check (objet_type in ('document', 'risque', 'audit'));
--   delete from migrations_schema where version = '035';
--   commit;
--   -- ⚠️ Annuler DÉTRUIT la trace des écarts assumés et de leurs approbations. C'est la
--   --    pièce qu'un auditeur demande quand il trouve une non-conformité : exportez-la.
-- =====================================================================================
