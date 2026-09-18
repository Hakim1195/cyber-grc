-- =====================================================================================
--  042 — LE REGISTRE D'INFORMATION DORA, ET LA CHAÎNE DE SOUS-TRAITANCE
--
--  §0      Le périmètre de la migration
--  §1      `prestataires` porte ce que DORA exige (21.1) et ce que le contrat dit (21.3)
--  §2      La table `prestataire_sous_traitance` — l'arête, pas le rang
--  §3      L'ANTI-CYCLE, EN BASE — et le rang se DÉRIVE
--  §4      Le score composite, DÉRIVÉ (21.4) — et son barème, servi et non recopié
--  §5      Le domaine « type_entite » admet la table
--  §6      Cloisonnement, provenance, traçabilité
--  §7      L'installateur des déclencheurs « les pièces suivent leur porteur »
--  §8      Le garde-fou
--  §9      Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Lot **L21** du `docs/PLAN_PRODUIT.md`, actions **21.1**, **21.3** et **21.4**. C'est
--  le domaine le plus faible du produit — *une fonctionnalité sur six* au
--  `docs/COMPARATIF_MARCHE.md` — et le besoin le plus tendu du marché français, puisque
--  DORA s'applique depuis le 17 janvier 2025 et que le **registre d'information** est la
--  pièce que l'autorité réclame en premier.
--
--  ── CE QUE LE PRODUIT SAVAIT DÉJÀ, ET QU'ON NE REFAIT PAS ──────────────────────────
--
--  `prestataires` existe depuis la migration `003` : société, type, contact, criticité,
--  niveau d'accès, et le sac `supply_chain` des six exigences NIS2/DORA. **On ne la
--  remplace pas.** Ce qui manquait est ailleurs, et c'est exactement ce que DORA nomme :
--
--   · **l'identité normalisée** du tiers — le **LEI**, sans lequel deux registres de deux
--     entités ne se recoupent pas, et le pays ;
--   · **la fonction supportée**, et si elle est *critique ou importante* au sens de
--     l'article 3 (22) — c'est ce seul drapeau qui fait basculer un contrat dans le
--     régime renforcé de l'article 30 §3 ;
--   · **le contrat** : sa référence, ses dates, sa revue ;
--   · **la sortie** : réversibilité, plan de sortie daté, substituabilité (article 28 §8) ;
--   · **la chaîne de sous-traitance**, qui est le cœur de l'article 29 — *un prestataire
--     critique qui sous-traite déplace le risque sans le réduire*.
--
--  ── ⚠️ LA DÉCISION DE CONCEPTION CENTRALE : LE RANG N'EST PAS UNE COLONNE ──────────
--
--  Le plan dit « chaîne de sous-traitance (rang 1, 2, n) ». La pente naturelle est une
--  colonne `rang` sur chaque tiers. Elle est **refusée**, et le motif est celui des
--  actions 19.2, 20.1 et 20.4 réunies : *un rang stocké demande que quelque chose le
--  recalcule*. Intercaler un sous-traitant au milieu d'une chaîne de cinq décale quatre
--  rangs ; le jour où le traitement qui les décale ne tourne pas, le registre remis à
--  l'autorité annonce des rangs faux — **en silence**, dans la pièce qui sert de preuve.
--
--  Ce qu'on range est donc l'**arête** — « A sous-traite à B pour tel service » —, et le
--  rang se **dérive** par parcours récursif (`f_chaine_sous_traitance`). Intercaler une
--  arête déplace tous les rangs en aval à l'instant même, sans qu'aucun code ne s'exécute.
--
--  ── ⚠️ ET L'ANTI-CYCLE EST EN BASE, PAS DANS LA ROUTE ──────────────────────────────
--
--  Le critère 21.1 l'exige en toutes lettres. Le motif est celui du `CONVENTIONS.md`
--  §8.1 : *une route ne voit que son chemin ; il y en a toujours un de plus* — l'import
--  généralisé (L7), la reprise d'un export `grc-backup`, `psql` en exploitation. Un cycle
--  « A sous-traite à B qui sous-traite à A » n'est pas une curiosité : c'est une saisie
--  ordinaire entre deux entités d'un même groupe, et il fait **boucler le calcul du
--  rang**. Le refus est donc un déclencheur, et le garde-fou du §8 l'ÉPROUVE.
--
--  ⚠️ **Le parcours porte NÉANMOINS sa clause `cycle`**, et ce n'est pas une ceinture de
--  plus par prudence : le déclencheur protège les écritures FUTURES, il ne dit rien des
--  lignes déjà en base au moment où il est posé. Une chaîne cyclique arrivée par une
--  reprise antérieure ferait boucler la lecture — c'est-à-dire figer une route au lieu de
--  la faire rougir, ce que le constat **Q-251** proscrit nommément.
-- =====================================================================================
-- Invocation :
--   psql -v ON_ERROR_STOP=1 -d cyber_grc -f 042_le_registre_dora_et_la_chaine.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §1 ajoute des contraintes qui VALIDENT les lignes existantes de `prestataires`, et
-- `force row level security` vaut pour le propriétaire. Sans périmètre, la validation ne
-- verrait qu'une partie des lignes — ou échouerait sans nommer sa cause. Motif du §0 de
-- la `012` : on déclare le groupe ENTIER, jamais une filiale.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-042', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — `prestataires` PORTE CE QUE DORA EXIGE (21.1) ET CE QUE LE CONTRAT DIT (21.3)
-- =====================================================================================
-- ⚠️ **Toutes ces colonnes sont NULLABLES, sauf une.** Le motif est celui du §1 de la
-- `037` : *un produit qui fabrique des alertes le jour de sa mise à jour apprend à ce
-- qu'on ignore ses alertes.* Un parc de deux cents tiers ne se remplit pas d'un coup, et
-- un registre DORA qui afficherait deux cents lignes rouges le lendemain de la migration
-- ne serait pas plus complet — il serait seulement illisible.
--
-- La seule exception est `fonction_critique`, `not null default false` : *« on ne sait
-- pas »* et *« ce n'est pas critique »* doivent se distinguer, et c'est `false` qui est le
-- défaut sûr — un tiers qu'on n'a pas encore examiné n'entre pas dans le régime renforcé
-- de l'article 30 §3 sans qu'un humain l'ait dit. ⚠️ Le sens du défaut a été pesé : faire
-- entrer par défaut TOUS les tiers dans le régime renforcé aurait produit deux cents
-- contrats réputés critiques, et la première chose qu'un exploitant aurait faite est de
-- les décocher en masse, sans les lire.

alter table prestataires
    add column if not exists lei                text,
    add column if not exists pays               text,
    add column if not exists fonction_supportee text,
    add column if not exists fonction_critique  boolean not null default false,
    add column if not exists type_service       text,
    add column if not exists contrat_reference  text,
    add column if not exists contrat_debut      date,
    add column if not exists contrat_fin        date,
    add column if not exists contrat_revue_le   date,
    add column if not exists pays_donnees       text,
    add column if not exists substituabilite    text,
    add column if not exists plan_sortie        text,
    add column if not exists plan_sortie_le     date,
    add column if not exists evalue_le          date;

-- ── ⚠️ LA CIBLE DES CLÉS ÉTRANGÈRES COMPOSITES MANQUAIT ─────────────────────────────
--
-- `CONVENTIONS.md` §19.1 : *tout contrôle que PostgreSQL applique hors des politiques
-- porte `filiale_id`*. La table `prestataires` date de la migration `003`, écrite avant
-- que la porte S1 n'élargisse la règle aux unicités — elle ne portait donc aucune cible
-- `(id, filiale_id)`, et les deux clés étrangères composites du §2 n'auraient rien eu à
-- référencer.
--
-- ⚠️ **Ce n'est pas une commodité d'écriture.** Une clé simple sur `prestataire_id` serait
-- satisfaite par un prestataire INVISIBLE de la filiale voisine — les contrôles
-- d'intégrité de PostgreSQL contournent délibérément la RLS —, et l'on déclarerait une
-- sous-traitance vers une société qu'on ne voit pas. C'est un oracle d'existence
-- inter-filiales sur la carte des fournisseurs du groupe.
alter table prestataires drop constraint if exists uq_prestataires_id_filiale;
alter table prestataires add constraint uq_prestataires_id_filiale unique (id, filiale_id);

comment on constraint uq_prestataires_id_filiale on prestataires is
    'Cible des clés étrangères composites (CONVENTIONS.md §19.1). Posée par la 042 : la '
    'table date de la 003, écrite avant que la porte S1 n''élargisse la règle aux '
    'unicités. Sans elle, la chaîne de sous-traitance se rattacherait par une clé simple, '
    'que satisfait une ligne INVISIBLE de la filiale voisine.';

-- ── Le LEI : vingt caractères, et une forme qui se vérifie ──────────────────────────
--
-- ISO 17442 : 18 caractères alphanumériques majuscules suivis de 2 chiffres de contrôle.
-- ⚠️ **On ne vérifie PAS la clé de contrôle ISO 7064 en base**, et c'est une décision :
-- elle ferait refuser un LEI parfaitement réel dont la norme aurait évolué, sur la table
-- qui porte le registre remis à l'autorité. La FORME est vérifiée — un LEI de dix-neuf
-- signes est une faute de frappe, sûrement —, la VALIDITÉ ne l'est pas, et l'écran dit à
-- l'utilisateur d'où vient son code.
alter table prestataires drop constraint if exists ck_prestataires_lei;
alter table prestataires add constraint ck_prestataires_lei
    check (lei is null or lei ~ '^[A-Z0-9]{18}[0-9]{2}$');

-- ── Les pays : ISO 3166-1 alpha-2, et rien d'autre ──────────────────────────────────
--
-- ⚠️ **Deux colonnes distinctes, et la distinction est le cœur de l'article 28 §2 g)** :
-- le pays du prestataire n'est pas celui où les données sont traitées. Un hébergeur
-- irlandais qui réplique en Virginie relève des deux, et les confondre rendrait le
-- registre faux sur la seule ligne qu'un régulateur regarde deux fois.
alter table prestataires drop constraint if exists ck_prestataires_pays;
alter table prestataires add constraint ck_prestataires_pays
    check ((pays is null or pays ~ '^[A-Z]{2}$')
       and (pays_donnees is null or pays_donnees ~ '^[A-Z]{2}$'));

-- ── Le type de service TIC ──────────────────────────────────────────────────────────
--
-- Vocabulaire clos, dérivé des catégories de l'annexe III du règlement d'exécution. Il
-- est volontairement COURT : neuf catégories qu'un exploitant sait trancher valent mieux
-- que trente qu'il tire au sort. « autre » existe, et c'est lui qui empêche la liste de
-- mentir — sans lui, on rangerait de force.
alter table prestataires drop constraint if exists ck_prestataires_type_service;
alter table prestataires add constraint ck_prestataires_type_service
    check (type_service is null or type_service in (
        'hebergement', 'cloud_iaas', 'cloud_paas', 'cloud_saas',
        'reseau', 'infogerance', 'developpement', 'securite', 'autre'));

-- ── La substituabilité (article 28 §8) ──────────────────────────────────────────────
alter table prestataires drop constraint if exists ck_prestataires_substituabilite;
alter table prestataires add constraint ck_prestataires_substituabilite
    check (substituabilite is null or substituabilite in ('facile', 'difficile', 'impossible'));

-- ── Les dates ───────────────────────────────────────────────────────────────────────
--
-- ⚠️ `contrat_fin` peut être nul, et c'est le cas le plus fréquent : un contrat à
-- tacite reconduction n'a pas de fin. Ce qui est refusé est une fin ANTÉRIEURE au début.
alter table prestataires drop constraint if exists ck_prestataires_contrat_dates;
alter table prestataires add constraint ck_prestataires_contrat_dates
    check (contrat_fin is null or contrat_debut is null or contrat_fin >= contrat_debut);

-- Bornes de saisie — contrôle S13. Une collection non bornée est une voie de déni de
-- service applicatif autant qu'un champ mal rempli (constat Q-214 c).
alter table prestataires drop constraint if exists ck_prestataires_longueurs;
alter table prestataires add constraint ck_prestataires_longueurs
    check ((fonction_supportee is null or length(fonction_supportee) <= 500)
       and (contrat_reference  is null or length(contrat_reference)  <= 200)
       and (plan_sortie        is null or length(plan_sortie)        <= 4000));

-- ── ⚠️ UN PLAN DE SORTIE DATÉ, OU PAS DE PLAN DE SORTIE ─────────────────────────────
--
-- Le critère 21.3 dit « plan de sortie **daté** ». L'implication, et non l'équivalence :
-- on peut dater sans avoir encore rédigé (la date d'échéance de rédaction est elle-même
-- un engagement), mais un plan rédigé sans date est précisément le document que personne
-- ne relira — et DORA article 28 §8 demande une stratégie de sortie *testée*, donc datée.
alter table prestataires drop constraint if exists ck_prestataires_sortie;
alter table prestataires add constraint ck_prestataires_sortie
    check (plan_sortie is null or plan_sortie_le is not null);

comment on column prestataires.lei is
    'Identifiant d''entité juridique (ISO 17442) — la clé sans laquelle deux registres '
    'DORA de deux entités ne se recoupent pas. ⚠️ Seule la FORME est vérifiée (18 '
    'alphanumériques + 2 chiffres) : la clé de contrôle ISO 7064 ne l''est PAS, parce '
    'qu''un contrôle trop zélé ferait refuser un code réel sur la table qui porte la '
    'pièce remise à l''autorité.';
comment on column prestataires.pays is
    'Pays du prestataire (ISO 3166-1 alpha-2). ⚠️ À NE PAS confondre avec pays_donnees : '
    'un hébergeur irlandais qui réplique en Virginie relève des deux, et l''article 28 §2 '
    'g) demande précisément les deux.';
comment on column prestataires.fonction_critique is
    'La fonction supportée est-elle « critique ou importante » au sens de l''article 3 '
    '(22) de DORA ? ⚠️ C''est ce seul drapeau qui fait basculer le contrat dans le régime '
    'renforcé de l''article 30 §3. « false » par défaut À DESSEIN : un tiers que personne '
    'n''a encore examiné n''entre pas dans le régime renforcé sans qu''un humain l''ait '
    'dit — le défaut inverse aurait produit deux cents contrats réputés critiques, que le '
    'premier exploitant venu aurait décochés en masse sans les lire.';
comment on column prestataires.contrat_revue_le is
    'Prochaine revue contractuelle (action 21.3). ⚠️ Elle alimente l''échéancier existant '
    '(js/services/echeances.js) : c''est une date d''obligation comme une autre, et lui '
    'faire un écran à part l''aurait rendue invisible à qui consulte ses échéances.';
comment on column prestataires.substituabilite is
    'À quel point ce prestataire est remplaçable (article 28 §8). Entre dans le score '
    'composite de l''action 21.4 : un tiers « impossible » à substituer porte un risque '
    'que ni sa criticité ni son niveau d''accès ne disent.';
comment on column prestataires.evalue_le is
    'Date de la dernière évaluation du tiers. ⚠️ Elle entre dans le score composite '
    '(21.4) : une évaluation de 2023 ne vaut pas une évaluation d''hier, et un produit '
    'qui les afficherait pareil apprendrait à ne pas regarder la date.';

-- Le registre de l'article 30 du produit réclame une décision pour CHAQUE colonne
-- (constat Q-295), et complète pour toute colonne « personnelle » (constat Q-296).
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('prestataires', 'lei', 'non_personnelle', null, null, null, null,
   'Identifiant d''une ENTITÉ JURIDIQUE (ISO 17442) : une société, pas une personne. '
   '⚠️ Un entrepreneur individuel peut être une entité juridique, mais le LEI désigne '
   'alors son entreprise et se publie dans un référentiel mondial ouvert.'),
  ('prestataires', 'pays', 'non_personnelle', null, null, null, null,
   'Code pays ISO 3166-1 : une géographie, elle ne désigne personne.'),
  ('prestataires', 'pays_donnees', 'non_personnelle', null, null, null, null,
   'Code pays ISO 3166-1 du traitement des données : une géographie.'),
  ('prestataires', 'fonction_supportee', 'non_personnelle', null, null, null, null,
   'Fonction métier soutenue par le contrat : une activité, pas une personne.'),
  ('prestataires', 'fonction_critique', 'non_personnelle', null, null, null, null,
   'Booléen du régime DORA : une qualification du contrat.'),
  ('prestataires', 'type_service', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos des catégories de services TIC.'),
  ('prestataires', 'contrat_reference', 'non_personnelle', null, null, null, null,
   'Référence documentaire du contrat : une cote, pas une personne.'),
  ('prestataires', 'contrat_debut', 'non_personnelle', null, null, null, null,
   'Date contractuelle : une date de gestion.'),
  ('prestataires', 'contrat_fin', 'non_personnelle', null, null, null, null,
   'Date contractuelle : une date de gestion.'),
  ('prestataires', 'contrat_revue_le', 'non_personnelle', null, null, null, null,
   'Date de revue : une date de gestion.'),
  ('prestataires', 'substituabilite', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (facile / difficile / impossible) : une qualification du contrat.'),
  ('prestataires', 'plan_sortie', 'personnelle',
   'Décrire comment sortir du contrat sans interrompre la fonction supportée (DORA art. 28 §8).',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom y figure souvent au '
   'milieu d''une phrase (« reprise par l''équipe de X »). Le remplacer détruirait la '
   'phrase, et cette phrase est l''engagement lui-même. Régime « signaler » : le produit '
   'montre l''emplacement, un humain tranche.'),
  ('prestataires', 'plan_sortie_le', 'non_personnelle', null, null, null, null,
   'Date du plan de sortie : une date de gestion.'),
  ('prestataires', 'evalue_le', 'non_personnelle', null, null, null, null,
   'Date de la dernière évaluation : une date de gestion.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §2 — LA TABLE `prestataire_sous_traitance` — L'ARÊTE, PAS LE RANG
-- =====================================================================================

create table if not exists prestataire_sous_traitance (
    id               id_metier   not null default f_generer_id('SOUS'),

    -- ⚠️ TOUJOURS locale. Une arête de sous-traitance appartient à la filiale qui a
    -- contracté : c'est ELLE qui sait que son hébergeur sous-traite sa sauvegarde, et
    -- deux filiales du groupe peuvent parfaitement connaître deux chaînes différentes
    -- pour le même couple de sociétés — l'une ayant négocié une clause que l'autre n'a
    -- pas. Une arête de portée Groupe ferait dire au registre d'une filiale une chose
    -- qu'elle n'a pas constatée.
    filiale_id       id_metier   not null,

    -- Le DONNEUR D'ORDRE et son SOUS-TRAITANT, tous deux des tiers de `prestataires`.
    -- ⚠️ Le sous-traitant est un `prestataires` comme un autre, et non une table à part :
    -- un sous-traitant de rang 2 devient un contractant direct le jour où la filiale
    -- signe avec lui, et deux tables auraient obligé à le RECOPIER — c'est-à-dire à
    -- fabriquer deux vérités sur la même société.
    prestataire_id   id_metier   not null,
    sous_traitant_id id_metier   not null,

    -- Ce qui est sous-traité. DORA article 29 : ce n'est pas « il sous-traite », c'est
    -- « il sous-traite CECI » — la sauvegarde, pas la facturation.
    service          text,
    -- Le sous-traitant intervient-il dans la fonction critique ou importante ? C'est la
    -- question que l'article 29 pose, et la seule qui décide d'une notification.
    dans_fonction_critique boolean not null default false,

    version          integer     not null default 1,
    cree_le          timestamptz not null default now(),
    cree_par         text        not null default f_utilisateur_courant(),
    modifie_le       timestamptz,
    modifie_par      text,

    constraint pk_prestataire_sous_traitance primary key (id),

    -- ⚠️ Les DEUX clés étrangères sont COMPOSITES — `CONVENTIONS.md` §17.1. Une clé
    -- simple serait satisfaite par un prestataire INVISIBLE de la filiale voisine : les
    -- contrôles d'intégrité de PostgreSQL contournent délibérément la RLS. On pourrait
    -- alors déclarer une sous-traitance vers une société qu'on ne voit pas — c'est-à-dire
    -- fabriquer un oracle d'existence inter-filiales sur la carte des fournisseurs du
    -- groupe, qui est exactement ce qu'un concurrent viendrait chercher.
    constraint fk_prestataire_sous_traitance_donneur
        foreign key (prestataire_id, filiale_id) references prestataires (id, filiale_id)
        on delete cascade,
    constraint fk_prestataire_sous_traitance_soustraitant
        foreign key (sous_traitant_id, filiale_id) references prestataires (id, filiale_id)
        on delete cascade,
    constraint fk_prestataire_sous_traitance_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- Cible des clés étrangères composites à venir (`CONVENTIONS.md` §19.1).
    constraint uq_prestataire_sous_traitance_id_filiale unique (id, filiale_id),

    -- Une seule arête par couple : deux lignes identiques ne diraient rien de plus, et
    -- feraient compter deux fois le même sous-traitant dans le registre. ⚠️ L'unicité
    -- porte `filiale_id` en TÊTE (§19.1) : sans elle, une filiale occuperait le couple
    -- d'une autre sur des identifiants qu'elle ne voit pas (constat Q-2).
    constraint uq_prestataire_sous_traitance_arete unique (filiale_id, prestataire_id, sous_traitant_id),

    -- La boucle de longueur un. Les boucles plus longues sont refusées par le
    -- déclencheur du §3 — ici, c'est une contrainte de table parce qu'elle se décide sur
    -- la seule ligne, et qu'une contrainte vaut mieux qu'un déclencheur quand elle suffit.
    constraint ck_prestataire_sous_traitance_boucle check (prestataire_id <> sous_traitant_id),

    constraint ck_prestataire_sous_traitance_longueurs check (service is null or length(service) <= 500)
);

comment on table prestataire_sous_traitance is
    'Chaîne de sous-traitance des tiers (action 21.1, DORA article 29). ⚠️ On y range '
    'l''ARÊTE — « A sous-traite CECI à B » —, jamais le RANG : un rang stocké demanderait '
    'que quelque chose le recalcule à chaque intercalation, et le jour où ce quelque '
    'chose ne tourne pas, le registre remis à l''autorité annonce des rangs faux en '
    'silence. Le rang se DÉRIVE (f_chaine_sous_traitance). ⚠️ Le sous-traitant est un '
    '« prestataires » comme un autre : deux tables auraient obligé à le recopier, donc à '
    'fabriquer deux vérités sur la même société.';

comment on column prestataire_sous_traitance.service is
    'CE QUI est sous-traité — la sauvegarde, pas la facturation. L''article 29 ne demande '
    'pas « sous-traite-t-il », il demande « sous-traite-t-il QUOI ».';
comment on column prestataire_sous_traitance.dans_fonction_critique is
    'Ce sous-traitant intervient-il dans la fonction critique ou importante ? C''est la '
    'seule question dont dépend une obligation de notification (DORA art. 29 §2).';

create index ix_prestataire_sous_traitance_donneur on prestataire_sous_traitance (filiale_id, prestataire_id);
create index ix_prestataire_sous_traitance_soustraitant on prestataire_sous_traitance (filiale_id, sous_traitant_id);

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('prestataire_sous_traitance', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('prestataire_sous_traitance', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('prestataire_sous_traitance', 'prestataire_id', 'non_personnelle', null, null, null, null,
   'Identifiant du donneur d''ordre : une société.'),
  ('prestataire_sous_traitance', 'sous_traitant_id', 'non_personnelle', null, null, null, null,
   'Identifiant du sous-traitant : une société.'),
  ('prestataire_sous_traitance', 'service', 'non_personnelle', null, null, null, null,
   'Objet de la sous-traitance : une prestation, pas une personne.'),
  ('prestataire_sous_traitance', 'dans_fonction_critique', 'non_personnelle', null, null, null, null,
   'Booléen du régime DORA : une qualification de la sous-traitance.')
on conflict (table_nom, colonne) do nothing;

-- La marque de provenance (migration `032`). La table naissant APRÈS elle, son balayage
-- ne peut pas l'avoir vue : on la rattrape ici, sinon le déploiement rougit.
alter table prestataire_sous_traitance
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_prestataire_sous_traitance_provenance on prestataire_sous_traitance;
create trigger trg_prestataire_sous_traitance_provenance before insert on prestataire_sous_traitance
    for each row execute function f_marquer_provenance();
alter table prestataire_sous_traitance enable always trigger trg_prestataire_sous_traitance_provenance;

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('prestataire_sous_traitance', 'provenance', 'non_personnelle',
        'Vocabulaire clos : d''où vient la ligne (saisie / decouverte / reprise), posée '
        'par la migration 032. Ne désigne aucune personne.')
on conflict (table_nom, colonne) do nothing;

-- ⚠️ On APPELLE les installateurs, on ne recopie pas leurs déclencheurs (§40).
select f_poser_tracabilite_insertion();

drop trigger if exists trg_prestataire_sous_traitance_maj on prestataire_sous_traitance;
create trigger trg_prestataire_sous_traitance_maj before update on prestataire_sous_traitance
    for each row execute function f_maj_tracabilite();
alter table prestataire_sous_traitance enable always trigger trg_prestataire_sous_traitance_maj;

-- =====================================================================================
-- §3 — L'ANTI-CYCLE, EN BASE — ET LE RANG SE DÉRIVE
-- =====================================================================================
-- ⚠️ **Le critère 21.1 dit « contrainte anti-cycle en base, pas dans la route ».** Le
-- motif est le §8.1 des conventions : *une route ne voit que son chemin ; il y en a
-- toujours un de plus.* Ici il y en a quatre — la route générique, l'import généralisé
-- (L7), la reprise d'un export `grc-backup`, et `psql` en exploitation.
--
-- ── CE QU'UNE CLAUSE `cycle` FAIT, ET CE QU'ELLE NE FAIT PAS ───────────────────────
--
-- `f_chaine_sous_traitance` porte une clause `cycle`. Elle **ne prévient pas** les
-- cycles : elle empêche la LECTURE de boucler si un cycle existe déjà — arrivé par une
-- reprise antérieure à cette migration, par exemple. C'est la garantie que le produit
-- *rougit* au lieu de *se figer*, et le constat **Q-251** dit pourquoi la distinction
-- compte : un essai qui se fige ne rougit jamais, et personne ne vient voir.
--
-- La PRÉVENTION, elle, est le déclencheur `f_sous_traitance_refuser_cycle()`.
--
-- ── LA FONCTION NE DEMANDE AUCUN PRIVILÈGE PARTICULIER, ET C'EST MESURÉ ────────────
--
-- Elle lit `prestataire_sous_traitance`, table cloisonnée. Elle n'est PAS `security
-- definer`, et elle n'en a pas besoin : les deux clés étrangères étant composites sur
-- `filiale_id`, un cycle ne peut exister qu'À L'INTÉRIEUR d'une filiale — et la session
-- qui écrit dans cette filiale la lit forcément (`f_filiale_ecriture()` est dans
-- `f_filiales_lecture()`). Une fonction `definer` aurait ouvert, pour rien, une lecture
-- hors périmètre sur la carte des fournisseurs du groupe.

create or replace function f_chaine_sous_traitance(p_filiale_id text, p_prestataire_id text)
returns table (sous_traitant_id text, rang integer, chemin text[], cycle_detecte boolean)
    language sql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
    with recursive descente as (
        select a.sous_traitant_id,
               1 as rang,
               array[a.prestataire_id, a.sous_traitant_id] as chemin
          from prestataire_sous_traitance a
         where a.filiale_id = p_filiale_id
           and a.prestataire_id = p_prestataire_id
        union all
        select a.sous_traitant_id,
               d.rang + 1,
               d.chemin || a.sous_traitant_id
          from descente d
          join prestataire_sous_traitance a
               on a.filiale_id = p_filiale_id
              and a.prestataire_id = d.sous_traitant_id
         -- ⚠️ LA PROFONDEUR EST BORNÉE, et ce n'est pas une prudence de plus.
         -- La clause `cycle` arrête une boucle ; elle n'arrête pas un graphe acyclique
         -- mais exponentiel — deux cents tiers reliés en losanges rendraient des
         -- millions de chemins distincts, tous légitimes. Dix rangs dépassent de loin ce
         -- que DORA demande (l'article 29 s'arrête au sous-traitant qui compte), et la
         -- borne est DITE à l'appelant par `rang = 10`, jamais tue.
           and d.rang < 10
    ) cycle sous_traitant_id set est_cycle using parcours
    select d.sous_traitant_id, d.rang, d.chemin, d.est_cycle
      from descente d
     order by d.rang, d.sous_traitant_id;
$$;

comment on function f_chaine_sous_traitance(text, text) is
    'Le RANG de chaque sous-traitant sous un prestataire donné, DÉRIVÉ par parcours '
    'récursif — jamais stocké (action 21.1). Intercaler une arête déplace tous les rangs '
    'en aval à l''instant même, sans qu''aucun traitement n''ait à repasser. ⚠️ La clause '
    '« cycle » ne PRÉVIENT pas les cycles (c''est l''office du déclencheur '
    'f_sous_traitance_refuser_cycle) : elle empêche la LECTURE de boucler si un cycle est déjà en '
    'base — le produit rougit au lieu de se figer (constat Q-251). ⚠️ Profondeur bornée à '
    '10 : la clause « cycle » arrête une boucle, pas un graphe acyclique exponentiel.';

create or replace function f_sous_traitance_refuser_cycle() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_chemin text[];
begin
    -- Le cycle se forme si le DONNEUR D'ORDRE est déjà atteignable DEPUIS le
    -- sous-traitant. On interroge donc la chaîne du sous-traitant et l'on y cherche le
    -- donneur d'ordre. ⚠️ La ligne neuve n'est pas encore visible en `before insert` —
    -- c'est exactement ce qu'on veut : on mesure le graphe SANS elle, et l'on décide si
    -- l'y ajouter le refermerait.
    select c.chemin into v_chemin
      from f_chaine_sous_traitance(new.filiale_id, new.sous_traitant_id) c
     where c.sous_traitant_id = new.prestataire_id
     limit 1;

    if v_chemin is not null then
        raise exception using
            errcode = 'GRC08',
            message = format('Cette sous-traitance referme une boucle : %s revient sur '
                             'lui-même par %s.', new.prestataire_id,
                             array_to_string(v_chemin, ' -> ')),
            hint    = 'Une chaîne de sous-traitance qui boucle rendrait le rang de chaque '
                      'maillon indéfinissable, et le registre d''information remis à '
                      'l''autorité incalculable. Retirez d''abord le maillon qui referme.';
    end if;
    return new;
end;
$$;

comment on function f_sous_traitance_refuser_cycle() is
    'Refuse une arête de sous-traitance qui refermerait une boucle (critère 21.1 : '
    '« contrainte anti-cycle EN BASE, pas dans la route »). ⚠️ En base parce qu''une '
    'route ne voit que son chemin, et qu''il y en a quatre : la route générique, l''import '
    'généralisé, la reprise d''un export, et psql en exploitation (CONVENTIONS.md §8.1). '
    'Code GRC08.';

drop trigger if exists trg_prestataire_sous_traitance_cycle on prestataire_sous_traitance;
create trigger trg_prestataire_sous_traitance_cycle before insert or update of prestataire_id, sous_traitant_id
    on prestataire_sous_traitance
    for each row execute function f_sous_traitance_refuser_cycle();
alter table prestataire_sous_traitance enable always trigger trg_prestataire_sous_traitance_cycle;

-- =====================================================================================
-- §4 — LE SCORE COMPOSITE, DÉRIVÉ (21.4) — ET SON BARÈME, SERVI ET NON RECOPIÉ
-- =====================================================================================
-- Le critère 21.4 : *« la criticité × accès existante devient un score composite
-- intégrant la couverture des exigences et l'ancienneté de la dernière évaluation. Le
-- score est DÉRIVÉ et recalculé, jamais stocké figé. »*
--
-- ── ⚠️ POURQUOI LE BARÈME EST UNE FONCTION, ET NON DES NOMBRES DANS DU CODE ────────
--
-- `js/modules/pra_prestataires.js` porte depuis le premier chantier `CRIT_W` et
-- `ACCES_W` — les mêmes poids, écrits une seconde fois. Tant que le score restait un
-- produit de deux facteurs, la duplication était visible et inoffensive. Elle cesse de
-- l'être ici : quatre facteurs, dont deux que le navigateur ne connaît pas.
--
-- Le barème est donc **rendu par la base**, servi par la route, et l'écran calcule son
-- aperçu AVEC les poids qu'on lui a donnés. Une seule rédaction, et la règle du
-- `CLAUDE.md` §3 est respectée : *on découvre, on ne recopie pas*.

create or replace function f_bareme_prestataire()
returns jsonb
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select jsonb_build_object(
        'criticite', jsonb_build_object('faible', 1, 'moyenne', 2, 'forte', 3, 'vitale', 4),
        'acces',     jsonb_build_object('aucun', 1, 'limite', 2, 'etendu', 3),
        'substituabilite', jsonb_build_object('facile', 0, 'difficile', 1, 'impossible', 2),
        -- Les deux seuils de l'ancienneté d'évaluation, en jours. 400 plutôt que 365 :
        -- une revue annuelle jouée avec cinq semaines de retard est en retard, elle
        -- n'est pas périmée, et crier au loup à J+366 apprend à ignorer l'alerte.
        'evaluation', jsonb_build_object('tiede_jours', 400, 'froid_jours', 730),
        'paliers',    jsonb_build_object('faible', 3, 'modere', 6, 'eleve', 10));
$$;

comment on function f_bareme_prestataire() is
    'Le barème du score composite de l''action 21.4 — poids de la criticité, de l''accès, '
    'de la substituabilité, seuils d''ancienneté d''évaluation et paliers de niveau. ⚠️ '
    'Il est SERVI à l''écran (GET /api/tiers/bareme) au lieu d''être recopié dans '
    'js/modules/pra_prestataires.js, qui portait déjà CRIT_W et ACCES_W : quatre facteurs '
    'dont deux que le navigateur ne connaît pas ne se dupliquent pas sans diverger.';

create or replace function f_score_prestataire(
    p_criticite       text,
    p_acces           text,
    p_substituabilite text,
    p_couverture      numeric,   -- part des exigences de chaîne satisfaites, 0 à 1, ou null
    p_evalue_le       date
)
returns integer
    language sql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
    -- ⚠️ `null` quand la BASE du score manque, et non zéro. « Non évalué » n'est pas
    -- « sans risque » : c'est le constat Q-201/Q-207 appliqué à un chiffre — un produit
    -- qui rend 0 pour « je ne sais pas » fabrique une fausse assurance, et c'est la
    -- règle de /api/consolidation, qui rend « null, jamais zéro ».
    select case
        when p_criticite is null or p_acces is null then null
        else
            (f_bareme_prestataire() -> 'criticite' ->> p_criticite)::integer
          * (f_bareme_prestataire() -> 'acces'     ->> p_acces)::integer
            -- La substituabilité AJOUTE, elle ne multiplie pas : un tiers irremplaçable
            -- aggrave, il ne double pas un risque déjà mesuré par ailleurs.
          + coalesce((f_bareme_prestataire() -> 'substituabilite' ->> p_substituabilite)::integer, 0)
            -- La couverture des exigences de chaîne RETRANCHE, au plus 2 points : ce
            -- sont les six cases NIS2/DORA du sac `supply_chain`. ⚠️ Une couverture
            -- INCONNUE ne retranche rien — ne pas savoir n'est pas une protection.
          - coalesce(round(coalesce(p_couverture, 0) * 2)::integer, 0)
            -- L'ancienneté de l'évaluation AJOUTE. ⚠️ Et une évaluation ABSENTE compte
            -- comme une évaluation froide : « jamais évalué » est au moins aussi grave
            -- que « évalué il y a trois ans », et le rendre plus doux inviterait à ne
            -- jamais commencer.
          + case
                when p_evalue_le is null then 2
                when p_evalue_le < current_date
                     - ((f_bareme_prestataire() -> 'evaluation' ->> 'froid_jours')::integer) then 2
                when p_evalue_le < current_date
                     - ((f_bareme_prestataire() -> 'evaluation' ->> 'tiede_jours')::integer) then 1
                else 0
            end
    end;
$$;

comment on function f_score_prestataire(text, text, text, numeric, date) is
    'Le score de risque composite d''un tiers (action 21.4), DÉRIVÉ et jamais stocké : '
    'criticité × accès, plus la substituabilité et l''ancienneté de l''évaluation, moins '
    'la couverture des exigences de chaîne. ⚠️ Rend NULL — et non zéro — quand la '
    'criticité ou l''accès manquent : « non évalué » n''est pas « sans risque », c''est la '
    'règle de /api/consolidation appliquée à un chiffre. ⚠️ Une évaluation ABSENTE pèse '
    'autant qu''une évaluation de trois ans : la rendre plus douce inviterait à ne jamais '
    'commencer.';

create or replace function f_niveau_prestataire(p_score integer)
returns text
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        when p_score is null then 'non_evalue'
        when p_score <= (f_bareme_prestataire() -> 'paliers' ->> 'faible')::integer then 'faible'
        when p_score <= (f_bareme_prestataire() -> 'paliers' ->> 'modere')::integer then 'modere'
        when p_score <= (f_bareme_prestataire() -> 'paliers' ->> 'eleve')::integer  then 'eleve'
        else 'critique'
    end;
$$;

comment on function f_niveau_prestataire(integer) is
    'Le niveau de risque d''un tiers, dérivé de son score par les paliers du barème. '
    'Cinq valeurs : non_evalue, faible, modere, eleve, critique. ⚠️ « non_evalue » est '
    'une valeur À PART, et non un « faible » par défaut : un écran qui les peindrait '
    'pareil ferait passer l''ignorance pour de la sécurité.';

grant execute on function f_chaine_sous_traitance(text, text) to grc_app;
grant execute on function f_bareme_prestataire() to grc_app;
grant execute on function f_score_prestataire(text, text, text, numeric, date) to grc_app;
grant execute on function f_niveau_prestataire(integer) to grc_app;

-- =====================================================================================
-- §5 — LE DOMAINE « type_entite » ADMET LA TABLE, SANS QUOI ELLE EST INCRÉABLE
-- =====================================================================================
-- Le piège du §40.1 : `journal_audit.entite_type` porte ce domaine, et TOUTE création
-- écrit au journal. Une table absente du domaine est donc, très exactement, INCRÉABLE.
-- On LIT le prédicat appliqué et l'on refuse d'agir s'il a changé (motif du §4 de la 027).

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
        raise exception 'type_entite_check est introuvable : la 001 n''a pas été '
                        'appliquée, et cette migration n''a rien à étendre.';
    end if;
    if position('''prestataire_sous_traitance''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà « prestataire_sous_traitance » : rejeu.';
        return;
    end if;
    if position('''demandes_droits''' in v_predicat) = 0 then
        raise exception 'La valeur « demandes_droits » est introuvable dans le prédicat '
                        'appliqué de type_entite_check : son texte a changé, et la '
                        'substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, '''demandes_droits''',
                      '''demandes_droits'', ''prestataire_sous_traitance''');

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais « prestataire_sous_traitance ».';
end;
$$;

-- =====================================================================================
-- §6 — CLOISONNEMENT
-- =====================================================================================

alter table prestataire_sous_traitance enable row level security;
alter table prestataire_sous_traitance force  row level security;

drop policy if exists pol_prestataire_sous_traitance_lecture     on prestataire_sous_traitance;
drop policy if exists pol_prestataire_sous_traitance_ajout       on prestataire_sous_traitance;
drop policy if exists pol_prestataire_sous_traitance_maj         on prestataire_sous_traitance;
drop policy if exists pol_prestataire_sous_traitance_suppression on prestataire_sous_traitance;

create policy pol_prestataire_sous_traitance_lecture on prestataire_sous_traitance for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_prestataire_sous_traitance_ajout on prestataire_sous_traitance for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_prestataire_sous_traitance_maj on prestataire_sous_traitance for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_prestataire_sous_traitance_suppression on prestataire_sous_traitance for delete
    using (filiale_id = f_filiale_ecriture());

comment on policy pol_prestataire_sous_traitance_lecture on prestataire_sous_traitance is
    'Une arête de sous-traitance est TOUJOURS locale : elle appartient à la filiale qui a '
    'contracté. Deux filiales peuvent connaître deux chaînes différentes pour le même '
    'couple de sociétés — l''une ayant négocié une clause que l''autre n''a pas —, et une '
    'arête de portée Groupe ferait dire au registre d''une filiale une chose qu''elle '
    'n''a pas constatée.';

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant select, insert, update, delete on prestataire_sous_traitance to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on prestataire_sous_traitance to grc_lecture';
    end if;
end;
$$;

-- L'armement, qui est une TROISIÈME chose (§19.4) : on DÉCOUVRE, on ne recopie pas.
select f_armer_declencheurs();

-- =====================================================================================
-- §7 — L'INSTALLATEUR DES DÉCLENCHEURS « LES PIÈCES SUIVENT LEUR PORTEUR »
-- =====================================================================================
-- ⚠️ **L'ORDRE EST UNE CONTRAINTE, PAS UN STYLE** (§40.2). Le prédicat de découverte
-- exige que la politique de SUPPRESSION de la table soit cloisonnée : appelée avant le
-- §6, la fonction ne verrait pas la table neuve, équiperait toutes les autres, rendrait
-- un compte plausible, et **laisserait la table démunie sans une erreur**.

do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §8 — LE GARDE-FOU
-- =====================================================================================
-- ⚠️ Il **ÉPROUVE** — `CONVENTIONS.md` §39.1. Un garde qui vérifierait que
-- `f_score_prestataire` « existe » passerait au vert sur une version qui rend toujours
-- zéro, c'est-à-dire sur celle qui déclare tout le parc de tiers sans risque.
--
-- ⚠️ Et l'anti-cycle est éprouvé **en tentant l'écriture interdite dans une transaction
-- ANNULÉE** (§39.1) : c'est la seule façon de mesurer qu'un déclencheur MORD, par
-- opposition à mesurer qu'il existe — la classe du constat Q-281, où cinq gardes
-- vérifiaient l'existence d'un déclencheur dont les événements avaient été déplacés.
--
-- ⚠️ **Mais il ne lit AUCUNE ligne d'une table cloisonnée** (§41) : `install.sh` appelle
-- `f_verifier_schema()` sans périmètre, et un garde qui lirait des lignes y rendrait un
-- verdict vide — c'est-à-dire vert — quelle que soit la réalité. L'épreuve de l'anti-cycle
-- se fait donc sur des lignes QU'IL CRÉE LUI-MÊME dans une transaction annulée, en se
-- posant d'abord son propre périmètre.

create or replace function f_verifier_tiers()
returns table (objet text, anomalie text, detail text)
    language plpgsql
    -- ⚠️ `stable` : un garde-fou de schéma n'ÉCRIT rien, et le registre des contrôles le
    -- vérifie (§19.4). C'est aussi la moitié du §39.8 — « un garde-fou n'exécute pas ce
    -- qu'il inspecte » —, et la seule que PostgreSQL sache imposer.
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les cas témoins du score. ⚠️ Le premier est celui qui compte : sans criticité, le
    -- score est NULL et non zéro.
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('c', null, 'a', 'etendu', 's', null, 'cv', 1, 'ev', 0,
            'attendu', null,
            'effet', 'un tiers NON ÉVALUÉ recevrait un score chiffré, et « je ne sais '
                     'pas » se lirait comme « sans risque » — c''est la règle de '
                     '/api/consolidation (null, jamais zéro) retournée contre elle-même'),
        -- vitale(4) x etendu(3) = 12, + impossible(2), - couverture 0 x 2, + jamais évalué(2) = 16
        jsonb_build_object('c', 'vitale', 'a', 'etendu', 's', 'impossible', 'cv', 0, 'ev', null,
            'attendu', 16,
            'effet', 'le pire tiers imaginable — vital, accès étendu, irremplaçable, '
                     'aucune exigence de chaîne, jamais évalué — cesserait d''être le '
                     'pire, et le classement du registre perdrait son sens'),
        -- faible(1) x aucun(1) = 1, + facile(0), - couverture 1 x 2 = -2, + évalué ce jour(0) = -1
        jsonb_build_object('c', 'faible', 'a', 'aucun', 's', 'facile', 'cv', 1, 'ev', 0,
            'attendu', -1,
            'effet', 'la couverture des exigences de chaîne cesserait de RETRANCHER : '
                     'remplir les six cases NIS2/DORA n''améliorerait plus rien, et '
                     'l''écran demanderait un travail sans effet'),
        -- moyenne(2) x limite(2) = 4, + null(0), - couverture inconnue(0), + jamais évalué(2) = 6
        jsonb_build_object('c', 'moyenne', 'a', 'limite', 's', null, 'cv', null, 'ev', null,
            'attendu', 6,
            'effet', 'une couverture INCONNUE se mettrait à protéger : ne pas savoir '
                     'deviendrait une assurance, ce qui est le défaut exact que le '
                     'régime « indetermine » existe pour empêcher')
    );
    v_cas_un  jsonb;
    v_rendu   integer;
    v_attendu integer;
    v_niveau  text;
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('table','prestataire_sous_traitance','nom','fk_prestataire_sous_traitance_donneur',
            'effet','le donneur d''ordre n''est plus cloisonné : une ligne INVISIBLE de la '
                   'filiale voisine satisfait la clé (CONVENTIONS §17.1), et l''on déclare '
                   'une sous-traitance vers une société qu''on ne voit pas — un oracle '
                   'd''existence sur la carte des fournisseurs du groupe'),
        jsonb_build_object('table','prestataire_sous_traitance','nom','fk_prestataire_sous_traitance_soustraitant',
            'effet','le sous-traitant n''est plus cloisonné : même oracle, par l''autre bout'),
        jsonb_build_object('table','prestataire_sous_traitance','nom','uq_prestataire_sous_traitance_arete',
            'effet','le même sous-traitant peut être déclaré deux fois sous le même '
                   'donneur d''ordre, et le registre remis à l''autorité le compte deux fois'),
        jsonb_build_object('table','prestataire_sous_traitance','nom','ck_prestataire_sous_traitance_boucle',
            'effet','un tiers peut se sous-traiter à lui-même : la boucle de longueur un, '
                   'que le déclencheur anti-cycle ne voit pas puisqu''elle n''a pas de chemin'),
        jsonb_build_object('table','prestataires','nom','ck_prestataires_lei',
            'effet','le LEI cesse d''avoir une forme : le registre DORA ne se recoupe plus '
                   'avec celui d''une autre entité, ce qui est tout son objet'),
        jsonb_build_object('table','prestataires','nom','ck_prestataires_sortie',
            'effet','un plan de sortie peut redevenir non daté — c''est-à-dire le document '
                   'que personne ne relira, là où DORA art. 28 §8 demande une stratégie '
                   'testée'),
        jsonb_build_object('table','prestataires','nom','ck_prestataires_contrat_dates',
            'effet','un contrat peut finir avant de commencer')
    );
    v_piece  jsonb;
    v_tgtype smallint;
begin
    -- ── 1. Les fonctions existent-elles seulement ? ─────────────────────────────────
    if to_regprocedure('public.f_score_prestataire(text, text, text, numeric, date)') is null
       or to_regprocedure('public.f_niveau_prestataire(integer)') is null
       or to_regprocedure('public.f_chaine_sous_traitance(text, text)') is null
       or to_regprocedure('public.f_bareme_prestataire()') is null then
        objet    := 'f_score_prestataire';
        anomalie := 'derivation_tiers_absente';
        detail   := 'Une des quatre fonctions dérivées de l''action 21.4 a disparu. Sans '
                    'elles, le score d''un tiers redeviendrait un nombre stocké — '
                    'c''est-à-dire un nombre que quelque chose doit recalculer, et qui '
                    'ment le jour où ce quelque chose ne tourne pas.';
        return next;
        return;
    end if;

    -- ── 2. LE SCORE EST ÉPROUVÉ sur des valeurs témoins, pas lu ─────────────────────
    for v_cas_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := f_score_prestataire(
            v_cas_un ->> 'c', v_cas_un ->> 'a', v_cas_un ->> 's',
            (v_cas_un ->> 'cv')::numeric,
            case when v_cas_un ->> 'ev' is null then null
                 else current_date - (v_cas_un ->> 'ev')::integer end);
        v_attendu := (v_cas_un ->> 'attendu')::integer;
        if v_rendu is distinct from v_attendu then
            objet    := 'f_score_prestataire';
            anomalie := 'score_tiers_faux';
            detail   := format(
                'Criticité « %s », accès « %s », substituabilité « %s » : la fonction '
                'rend « %s » au lieu de « %s ». Ce que cela produit : %s. ⚠️ Ce garde '
                'ÉPROUVE la dérivation sur des valeurs témoins — il ne lit pas le texte '
                'de la fonction (§39.1).',
                coalesce(v_cas_un ->> 'c', '(aucune)'), coalesce(v_cas_un ->> 'a', '(aucun)'),
                coalesce(v_cas_un ->> 's', '(aucune)'),
                coalesce(v_rendu::text, '(null)'), coalesce(v_attendu::text, '(null)'),
                v_cas_un ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 3. « non évalué » est une valeur à part, pas un « faible » ──────────────────
    v_niveau := f_niveau_prestataire(null);
    if v_niveau is distinct from 'non_evalue' then
        objet    := 'f_niveau_prestataire';
        anomalie := 'niveau_tiers_non_evalue_efface';
        detail   := format(
            'Un score absent rend le niveau « %s » au lieu de « non_evalue ». Un écran '
            'qui peindrait l''ignorance comme un risque faible ferait passer le fait de '
            'ne rien savoir pour de la sécurité — classe des constats Q-201 / Q-207.',
            coalesce(v_niveau, '(null)'));
        return next;
    end if;

    -- ── 4. Les pièces nommées UNE PAR UNE (§39.7) ───────────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.' || (v_piece ->> 'table'))
               and c.conname = v_piece ->> 'nom'
               -- ⚠️ `convalidated` : une contrainte reposée « not valid » garde son
               -- prédicat et n'a JAMAIS vérifié les lignes déjà en base (constat Q-319).
               and c.convalidated)
        then
            objet    := (v_piece ->> 'table') || '.' || (v_piece ->> 'nom');
            anomalie := 'tiers_piece_manquante';
            detail   := format('Cette pièce du lot L21 a disparu ou n''est pas validée. '
                               'Ce que sa disparition rouvre : %s.', v_piece ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 5. L'ANTI-CYCLE EST ARMÉ, ET IL MORD ────────────────────────────────────────
    --
    -- D'abord l'armement, mesuré par `tgtype` et non par la seule existence : c'est la
    -- leçon du constat Q-281, où des gardes vérifiaient qu'un déclencheur existe pendant
    -- que ses événements avaient été déplacés.
    select t.tgtype into v_tgtype
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = to_regclass('public.prestataire_sous_traitance')
       and not t.tgisinternal and p.proname = 'f_sous_traitance_refuser_cycle';

    if v_tgtype is null then
        objet    := 'prestataire_sous_traitance';
        anomalie := 'anticycle_absent';
        detail   := 'trg_prestataire_sous_traitance_cycle a disparu. Une chaîne de sous-traitance peut alors '
                    'boucler, et le rang de chaque maillon devient indéfinissable — '
                    'c''est-à-dire que le registre d''information DORA devient '
                    'incalculable, sur la pièce que l''autorité réclame en premier.';
        return next;
    elsif (v_tgtype & 1) <> 1 or (v_tgtype & 2) <> 2
          or (v_tgtype & 4) <> 4 or (v_tgtype & 16) <> 16 then
        objet    := 'prestataire_sous_traitance';
        anomalie := 'anticycle_mal_arme';
        detail   := format('trg_prestataire_sous_traitance_cycle n''est plus un « before insert or update » par '
                           'ligne (tgtype = %s). Les arêtes ajoutées par un des quatre '
                           'chemins d''écriture cesseraient d''être examinées.', v_tgtype);
        return next;
    end if;

    -- ── 6. ET LA MORSURE SE MESURE AILLEURS — C'EST LE §41, ET IL EST DÉLIBÉRÉ ──────
    --
    -- La tentation était d'éprouver ici l'anti-cycle en tentant l'arête interdite dans
    -- une transaction annulée, comme le §39.1 le demande pour une contrainte. Elle est
    -- **refusée**, et le motif est le `CONVENTIONS.md` §41 : *un garde-fou de schéma ne
    -- lit — ni n'écrit — aucune ligne d'une table cloisonnée.* `install.sh` appelle
    -- `f_verifier_schema()` SANS périmètre ; l'épreuve y créerait sa filiale témoin, ses
    -- deux tiers et son arête à chaque démarrage du service, sous un rôle dont la RLS
    -- n'accorde rien — c'est-à-dire qu'elle échouerait pour une raison étrangère au
    -- défaut qu'elle prétend chercher, ou pire, qu'elle conclurait au vert.
    --
    -- La morsure est donc mesurée là où les comportements se mesurent : au banc, par
    -- `test/base/tiers-anticycle.test.mjs`, qui tente l'arête B -> A alors que A -> B
    -- existe, **par la route ET en SQL direct** — la seconde parce qu'un essai qui passe
    -- par la route ne mesure pas le déclencheur, la route reposant elle-même la bonne
    -- valeur (leçon du 10/09, constat Q-282).
    --
    -- Ce que ce garde-ci tient, et qu'aucun essai ne tiendrait aussi bien : le
    -- déclencheur est PRÉSENT et ARMÉ sur les deux événements. C'est la moitié
    -- catalographique, et c'est la sienne.

    return;
end;
$$;

comment on function f_verifier_tiers() is
    'Garde-fou du lot L21 : le score composite est ÉPROUVÉ sur quatre cas témoins (§39.1), '
    '« non_evalue » est vérifié distinct de « faible », les sept pièces du schéma sont '
    'nommées UNE PAR UNE (§39.7), et l''anti-cycle est vérifié PRÉSENT et ARMÉ sur ses '
    'deux événements, mesuré par tgtype (leçon Q-281). ⚠️ Sa MORSURE est éprouvée au '
    'banc et non ici — §41 : un garde de schéma ne lit ni n''écrit aucune ligne d''une '
    'table cloisonnée, install.sh l''appelant sans périmètre. Découvert par '
    'f_decouvrir_controles_schema().';

grant execute on function f_verifier_tiers() to grc_app;

-- =====================================================================================
-- §9 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
-- =====================================================================================

select f_consigner_controles_schema();

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 042 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, registre DORA compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('042', 'le registre d''information DORA et la chaîne de sous-traitance : '
               'l''arête se range, le RANG se dérive, l''anti-cycle est en base, et le '
               'score composite d''un tiers n''est jamais stocké figé (21.1, 21.3, 21.4)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_tiers();
--   delete from controles_schema where fonction = 'f_verifier_tiers';
--   drop table if exists prestataire_sous_traitance;
--   drop function if exists f_sous_traitance_refuser_cycle();
--   drop function if exists f_chaine_sous_traitance(text, text);
--   drop function if exists f_niveau_prestataire(integer);
--   drop function if exists f_score_prestataire(text, text, text, numeric, date);
--   drop function if exists f_bareme_prestataire();
--   alter table prestataires
--       drop column if exists lei, drop column if exists pays,
--       drop column if exists fonction_supportee, drop column if exists fonction_critique,
--       drop column if exists type_service, drop column if exists contrat_reference,
--       drop column if exists contrat_debut, drop column if exists contrat_fin,
--       drop column if exists contrat_revue_le, drop column if exists pays_donnees,
--       drop column if exists substituabilite, drop column if exists plan_sortie,
--       drop column if exists plan_sortie_le, drop column if exists evalue_le;
--   delete from colonnes_personnelles where table_nom = 'prestataire_sous_traitance';
--   delete from migrations_schema where version = '042';
--   commit;
-- ⚠️ Annuler DÉTRUIT le registre d'information DORA, que l'autorité peut réclamer sous
--    quinze jours. Exporter d'abord.
-- =====================================================================================
