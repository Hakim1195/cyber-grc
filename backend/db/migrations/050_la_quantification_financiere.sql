-- =====================================================================================
--  050 — LA QUANTIFICATION FINANCIÈRE D'UN RISQUE (FAIR)
--
--  §0   Le périmètre de la migration
--  §1   La dérivation — la moyenne PERT, et ce qu'elle REFUSE de rendre
--  §2   La table — une quantification par risque, cloisonnée
--  §2 bis  Ce que toute table métier doit à trois garde-fous déjà posés
--  §3   `type_entite`
--  §4   Cloisonnement
--  §5   ⚠️ LE GARDE-FOU DU LOT, ÉLARGI : il mesure, il ne reconnaît plus un NOM
--  §6   Le garde-fou de la quantification
--  §7   Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — action 25.4 du `docs/PLAN_PRODUIT.md`
--
--  Le critère d'acceptation dit le défaut avant le remède :
--
--    *« Une valeur en euros n'est affichée QUE si ses hypothèses sont saisies. Pas
--      d'estimation par défaut : un chiffre inventé en comité de direction est pire que
--      pas de chiffre. »*
--
--  ── CE QUE LA QUANTIFICATION AJOUTE, ET POURQUOI ELLE SUIT L'ACTION 25.3 ──────────
--
--  L'action 25.3 vient de rendre explicite ce qu'une cotation ordinale veut dire — et,
--  ce faisant, elle a rendu visible la limite de la méthode : **deux gravités « 3 »
--  produites sur deux échelles ne s'additionnent pas**, et la consolidation refuse
--  désormais de le faire. C'est honnête, et c'est une impasse pour la seule question
--  qu'un comité de direction pose : *« combien ça nous coûte ? »*
--
--  Une somme d'argent, elle, s'additionne — toujours, partout, à devise égale. C'est la
--  raison d'être de FAIR (*Factor Analysis of Information Risk*), et c'est ce que cette
--  migration apporte : une grandeur **comparable entre filiales**, là où F × G × M ne
--  l'est que par convention.
--
--  ⚠️ **À devise égale, et le produit le MESURE** : la consolidation somme les pertes
--  annualisées d'un périmètre, et rend `null` dès que deux devises y coexistent — même
--  mécanique qu'aux échelles, pour la même raison. Un euro et un dollar additionnés font
--  un nombre, jamais une somme.
--
--  ── LA MÉTHODE, EN TROIS LIGNES, ET CE QU'ELLE REFUSE ────────────────────────────
--
--  FAIR décompose la perte attendue en deux facteurs, chacun estimé par un **triplet**
--  (minimum, plus probable, maximum) plutôt que par un chiffre unique :
--
--    • la **fréquence** d'un événement de perte — combien de fois par an ;
--    • la **magnitude** d'une perte — combien coûte UN événement.
--
--  La perte annualisée est le produit des deux moyennes. La moyenne d'un triplet est la
--  **moyenne PERT** — `(min + 4 × probable + max) / 6` —, celle du domaine, qui pèse
--  quatre fois l'estimation centrale sans ignorer les bornes.
--
--  ⚠️ **ET C'EST LÀ QUE LE CRITÈRE MORD** : un triplet incomplet ne rend RIEN. Deux
--  valeurs sur trois donneraient un nombre — la moyenne des deux —, et ce nombre aurait
--  l'air d'être mesuré. C'est le défaut exact que `f_ebios_pertinence` refuse déjà pour
--  la pertinence d'un couple source/objectif (migration `046` §6), et le motif y était
--  écrit dans ces termes : *un chiffre qui a l'air mesuré sans l'être est pire que pas de
--  chiffre, parce qu'il est cité en comité de direction*.
--
--  Le refus est posé à DEUX étages, et les deux sont nécessaires :
--
--    1. la **contrainte** `ck_..._triplet_*` refuse d'écrire un triplet à deux valeurs —
--       la donnée incohérente n'entre pas ;
--    2. la **dérivation** `f_fair_perte_annualisee()` rend `null` sur tout argument nul —
--       parce qu'une contrainte ne protège que la table, et que la fonction est appelable
--       ailleurs (le garde-fou du §6 l'appelle, un écran de simulation pourrait le faire).
--
--  ── LES PERTES SECONDAIRES : LE CHIFFRE EST UN PLANCHER, ET LE PRODUIT LE DIT ────
--
--  FAIR distingue la perte **primaire** — ce que l'incident coûte directement : remise en
--  service, heures perdues, matériel — de la perte **secondaire** : l'amende du régulateur,
--  le litige, le client perdu, la réputation. Pour un logiciel de conformité NIS2, DORA et
--  RGPD, la seconde est souvent la plus grosse : c'est elle qui porte les 4 % du chiffre
--  d'affaires mondial de l'article 83 du RGPD.
--
--  ⚠️ **Elle est FACULTATIVE, et son absence ne vaut pas zéro.** La tentation était
--  d'écrire `coalesce(secondaire, 0)` : le calcul aurait toujours abouti, et la perte
--  annualisée aurait été **sous-estimée en silence** sur toute quantification où personne
--  n'a pris le temps d'estimer l'amende. C'est une estimation par défaut, exactement celle
--  que le critère interdit — dans le sens rassurant, qui est le pire des deux.
--
--  Le choix retenu : la perte annualisée **reste calculable sans les pertes secondaires**,
--  et la table porte alors la marque `secondaire_estimee = false`. L'écran affiche
--  « ≥ 120 000 € » au lieu de « 120 000 € ». Un plancher annoncé comme tel est une
--  information ; un plancher présenté comme un total est un faux.
--
--  ── CE QUE CETTE MIGRATION NE FAIT PAS ───────────────────────────────────────────
--
--  **Elle ne touche pas à `risques`.** Aucune colonne, aucun déclencheur : la cotation
--  F × G × M reste ce qu'elle était, et la quantification vit à côté. C'est le « EN
--  ADDITION » du lot L25 tout entier (critère 25.1), et il n'est pas tenu par cette
--  phrase — il est tenu par le §5, qui ÉLARGIT le garde-fou existant.
--
--  ⚠️ **LE §5 EST LE PARAGRAPHE LE PLUS IMPORTANT DE CETTE MIGRATION, ET IL NE PARLE PAS
--  DE QUANTIFICATION.** `f_verifier_ebios_cadrage()`, qui tient ce « en addition » depuis
--  la `046`, ne balayait que les tables dont le NOM commence par `ebios_`. La table créée
--  ici s'appelle `risque_quantification` : elle lui échappait, et **la garantie centrale
--  du lot aurait cessé de s'appliquer sans que rien ne le dise**.
--
--  Le `docs/PLAN_PRODUIT.md` nommait les deux issues et tranchait : renommer la table pour
--  entrer dans le motif, ou élargir le garde à ce qu'il MESURE. La seconde est retenue —
--  c'est la règle du `CONVENTIONS.md` §39, et c'est mot pour mot la leçon des constats
--  **Q-312** et **Q-313** : *reconnaître un NOM au lieu de mesurer ce qu'une chose FAIT*.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Le §2 crée une table et ses clés étrangères, qui se VALIDENT contre `risques` — table
-- cloisonnée, et `force row level security` vaut pour le propriétaire. Sans périmètre, la
-- validation ne verrait aucune ligne et la migration passerait pour un mauvais motif.
-- Règle du `CONVENTIONS.md` §42 : on déclare le groupe ENTIER, jamais une filiale.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-050', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LA DÉRIVATION — LA MOYENNE PERT, ET CE QU'ELLE REFUSE DE RENDRE
-- -------------------------------------------------------------------------------------
-- ⚠️ **Pourquoi une FONCTION et non une expression dans la colonne engendrée.**
--
-- Une colonne `generated always as ((f_min + 4*f_prob + f_max)/6 * …)` aurait tenu en
-- trois lignes et fonctionné. Elle aurait aussi été **impossible à éprouver** : un
-- garde-fou ne peut pas appeler une expression, il ne peut que relire son texte — et
-- relire un texte est exactement ce que le `CONVENTIONS.md` §39.1 interdit depuis que
-- `check (… or true)` est passé au vert sous zéro anomalie (constat **Q-312**).
--
-- Avec une fonction, le garde du §6 SOUMET des cas témoins et compare le rendu. C'est le
-- patron de `f_ebios_pertinence` (migration `046`), et il a déjà payé : ses six cas
-- témoins tiennent le « pas d'estimation par défaut » de l'atelier 2.
--
-- `immutable` est exigé par la colonne engendrée du §2 — et c'est vrai : la fonction est
-- de l'arithmétique sur ses arguments, sans lecture de table ni d'horloge.
-- =====================================================================================

create or replace function f_fair_moyenne_pert(
    p_min numeric, p_probable numeric, p_max numeric)
returns numeric
    language sql immutable parallel safe
    set search_path = pg_catalog, public, pg_temp as
$$
    -- ⚠️ `num_nulls` plutôt que trois `is null` : le jour où un quatrième paramètre
    -- s'ajoute, la forme reste juste. Et le retour est `null`, JAMAIS zéro — zéro est
    -- une estimation, `null` est l'absence d'estimation, et tout le critère 25.4 tient
    -- dans cette distinction.
    select case when num_nulls(p_min, p_probable, p_max) > 0 then null
                else (p_min + 4 * p_probable + p_max) / 6 end;
$$;

comment on function f_fair_moyenne_pert(numeric, numeric, numeric) is
    'Moyenne PERT d''un triplet (minimum, plus probable, maximum) : (min + 4·probable + '
    'max) / 6. ⚠️ Rend NULL dès qu''un des trois manque — deux valeurs sur trois '
    'donneraient un nombre qui AURAIT L''AIR mesuré, et c''est le défaut que le critère '
    '25.4 nomme. Éprouvée par f_verifier_quantification_fair() sur des cas témoins.';

create or replace function f_fair_perte_annualisee(
    p_frequence_min numeric, p_frequence_probable numeric, p_frequence_max numeric,
    p_perte_min numeric, p_perte_probable numeric, p_perte_max numeric,
    p_secondaire_min numeric, p_secondaire_probable numeric, p_secondaire_max numeric)
returns numeric
    language sql immutable parallel safe
    set search_path = pg_catalog, public, pg_temp as
$$
    -- La perte annualisée : fréquence moyenne × magnitude moyenne.
    --
    -- ⚠️ **Le `coalesce` du terme secondaire n'est PAS une estimation par défaut**, et la
    -- nuance se joue à un caractère près. Il ne remplace pas une estimation manquante par
    -- zéro dans le RÉSULTAT rendu à l'utilisateur : il dit que la somme ne porte alors
    -- QUE la perte primaire. La table marque ce cas (`secondaire_estimee`), l'écran
    -- affiche « ≥ » devant le montant, et le garde du §6 mesure que la marque suit.
    --
    -- Sans cette marque, le `coalesce` serait le défaut : un plancher présenté comme un
    -- total, dans le sens rassurant.
    select case
        when f_fair_moyenne_pert(p_frequence_min, p_frequence_probable, p_frequence_max)
             is null
          or f_fair_moyenne_pert(p_perte_min, p_perte_probable, p_perte_max) is null
        then null
        else f_fair_moyenne_pert(p_frequence_min, p_frequence_probable, p_frequence_max)
           * (f_fair_moyenne_pert(p_perte_min, p_perte_probable, p_perte_max)
              + coalesce(f_fair_moyenne_pert(p_secondaire_min, p_secondaire_probable,
                                             p_secondaire_max), 0))
    end;
$$;

comment on function f_fair_perte_annualisee(numeric, numeric, numeric, numeric, numeric,
                                            numeric, numeric, numeric, numeric) is
    'Perte annualisée FAIR : moyenne PERT de la fréquence × (moyenne PERT de la perte '
    'primaire + moyenne PERT de la perte secondaire, si elle est estimée). ⚠️ Rend NULL '
    'si la fréquence ou la perte primaire est incomplète — pas d''estimation par défaut '
    '(critère 25.4). ⚠️ Les pertes secondaires absentes ne valent pas zéro : elles font '
    'du résultat un PLANCHER, que « risque_quantification.secondaire_estimee » marque et '
    'que l''écran annonce par un « ≥ ».';

-- =====================================================================================
-- §2 — LA TABLE — UNE QUANTIFICATION PAR RISQUE, CLOISONNÉE
-- -------------------------------------------------------------------------------------
-- ⚠️ **Cloisonnée, et non MIXTE.** Les deux tables du lot précédent étaient mixtes parce
-- qu'une échelle est une CONVENTION, que le Groupe peut poser pour tous. Un montant de
-- perte n'en est pas une : il dépend du chiffre d'affaires de la filiale, de son parc, de
-- sa clientèle. Une quantification de portée Groupe n'aurait aucun sens — et, pire, elle
-- serait lisible de toutes les filiales, qui y liraient le coût d'un incident chez la
-- voisine.
--
-- ⚠️ **UNE PAR RISQUE, et l'unicité est COMPOSITE.** `unique (risque_id, filiale_id)` et
-- non `unique (risque_id)` : une unicité sans `filiale_id` laisse une filiale occuper
-- l'identifiant d'une autre, et la RLS ne voit pas les unicités (`CONVENTIONS.md` §19.1).
--
-- ⚠️ **PAS DE VERSIONNEMENT DE LA QUANTIFICATION, et c'est un arbitrage.** Une échelle est
-- figée parce que des cotations la POINTENT : la modifier rendrait fausse une promesse
-- affichée ailleurs. Rien ne pointe une quantification. Ce qu'il faut d'elle, c'est
-- l'historique de ses révisions — et le journal d'audit le porte déjà, avec ses valeurs
-- avant et après, en ajout seul, pour trois ans. Réinventer ici un mécanisme de révision
-- ferait une seconde source de la même histoire (constat **Q-219**).
-- =====================================================================================

create table if not exists risque_quantification (
    id         id_metier   not null default f_generer_id('FAIR'),
    filiale_id id_metier   not null,
    risque_id  id_metier   not null,

    -- La devise. ⚠️ Elle n'est PAS décorative : la consolidation refuse d'additionner
    -- deux devises, exactement comme elle refuse d'additionner deux échelles. Le groupe a
    -- des filiales à l'étranger (`PLAN_SERVEUR`), et le cas est nominal, pas théorique.
    devise     text        not null default 'EUR',

    -- ── LA FRÉQUENCE D'UN ÉVÉNEMENT DE PERTE, en événements par an ────────────────
    frequence_min      numeric,
    frequence_probable numeric,
    frequence_max      numeric,

    -- ── LA PERTE PRIMAIRE d'UN événement : remise en service, heures, matériel ────
    perte_min      numeric,
    perte_probable numeric,
    perte_max      numeric,

    -- ── LA PERTE SECONDAIRE, facultative : amende, litige, client perdu ───────────
    -- ⚠️ Son absence ne vaut pas zéro : elle fait du total un PLANCHER (voir §1).
    secondaire_min      numeric,
    secondaire_probable numeric,
    secondaire_max      numeric,

    -- ⚠️ **LA PIÈCE MAÎTRESSE DU CRITÈRE.** Sans hypothèses écrites, un montant n'est pas
    -- une estimation : c'est une opinion avec une virgule. La colonne est `not null` et
    -- non vide, ce qui rend la ligne INCRÉABLE sans elles — plutôt que de laisser l'écran
    -- masquer le montant, ce qu'un autre écran oublierait de faire.
    hypotheses     text        not null,
    source_donnees text,
    confiance      text,
    evaluee_le     date        not null,

    -- ⚠️ **DÉRIVÉE, et stockée pour être indexable et sommable en SQL.** Engendrée
    -- « always » : aucun appelant ne peut y écrire, et la couche d'écriture l'exclut déjà
    -- par construction (elle ne nomme que les colonnes `engendree = false`).
    perte_annualisee numeric generated always as (
        f_fair_perte_annualisee(frequence_min, frequence_probable, frequence_max,
                                perte_min, perte_probable, perte_max,
                                secondaire_min, secondaire_probable, secondaire_max)
    ) stored,

    -- La marque qui rend le plancher lisible. Engendrée elle aussi : la tenir à jour à la
    -- main, c'est accepter qu'elle mente un jour.
    secondaire_estimee boolean generated always as (
        num_nulls(secondaire_min, secondaire_probable, secondaire_max) = 0
    ) stored,

    version    integer     not null default 1,
    cree_le    timestamptz not null default now(),
    cree_par   text        not null default f_utilisateur_courant(),
    modifie_le timestamptz,
    modifie_par text,

    constraint pk_risque_quantification primary key (id),
    constraint fk_risque_quantification_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- ⚠️ COMPOSITE : une clé simple est satisfaite par une ligne INVISIBLE de la filiale
    -- voisine (`CONVENTIONS.md` §17.1). `cascade` : la quantification d'un risque
    -- supprimé n'a plus d'objet — elle ne survit pas en orpheline invisible.
    constraint fk_risque_quantification_risque foreign key (risque_id, filiale_id)
        references risques (id, filiale_id) on delete cascade,

    -- ── LES TROIS TRIPLETS : TOUT OU RIEN ────────────────────────────────────────
    -- ⚠️ **C'est le premier des deux étages du refus.** Deux valeurs sur trois
    -- produiraient une moyenne — celle des deux —, et ce nombre aurait l'air mesuré.
    constraint ck_risque_quantification_triplet_frequence check (
        num_nulls(frequence_min, frequence_probable, frequence_max) in (0, 3)),
    constraint ck_risque_quantification_triplet_perte check (
        num_nulls(perte_min, perte_probable, perte_max) in (0, 3)),
    constraint ck_risque_quantification_triplet_secondaire check (
        num_nulls(secondaire_min, secondaire_probable, secondaire_max) in (0, 3)),

    -- ── L'ORDRE DU TRIPLET ───────────────────────────────────────────────────────
    -- Un « minimum » supérieur au « plus probable » n'est pas une saisie discutable :
    -- c'est une saisie fausse, et la moyenne PERT qui en sort n'a aucun sens.
    constraint ck_risque_quantification_ordre_frequence check (
        frequence_min is null
        or (frequence_min <= frequence_probable and frequence_probable <= frequence_max)),
    constraint ck_risque_quantification_ordre_perte check (
        perte_min is null
        or (perte_min <= perte_probable and perte_probable <= perte_max)),
    constraint ck_risque_quantification_ordre_secondaire check (
        secondaire_min is null
        or (secondaire_min <= secondaire_probable
            and secondaire_probable <= secondaire_max)),

    -- ── LES BORNES — contrôle S13 ────────────────────────────────────────────────
    -- ⚠️ Le plancher est zéro, jamais négatif : une fréquence ou une perte négative
    -- inverserait le signe du produit, et l'écran afficherait un risque qui RAPPORTE.
    -- Le plafond existe pour que la saisie d'un zéro de trop se voie au lieu de fausser
    -- une consolidation de groupe : mille milliards par événement, dix mille événements
    -- par an — deux ordres de grandeur au-dessus de tout ce qui est plausible.
    constraint ck_risque_quantification_frequence_bornes check (
        frequence_min is null or (frequence_min >= 0 and frequence_max <= 10000)),
    constraint ck_risque_quantification_perte_bornes check (
        perte_min is null or (perte_min >= 0 and perte_max <= 1000000000000)),
    constraint ck_risque_quantification_secondaire_bornes check (
        secondaire_min is null
        or (secondaire_min >= 0 and secondaire_max <= 1000000000000)),

    -- ⚠️ ISO 4217 : trois capitales. Le motif est ANCRÉ aux deux bouts et de longueur
    -- FIXE — aucune classe négative non bornée, donc aucun coût quadratique possible
    -- (règle n° 7 du `PLAN_PRODUIT` §5, constats Q-208 et Q-215).
    constraint ck_risque_quantification_devise check (devise ~ '^[A-Z]{3}$'),
    constraint ck_risque_quantification_hypotheses check (hypotheses <> ''),
    constraint ck_risque_quantification_confiance check (
        confiance is null or confiance in ('faible', 'moyenne', 'élevée')),
    constraint ck_risque_quantification_longueurs check (
        length(hypotheses) <= 4000
        and (source_donnees is null or length(source_donnees) <= 500))
);

-- ⚠️ COMPOSITE : voir l'en-tête du §2. Une unicité sans `filiale_id` laisse une filiale
-- occuper l'identifiant d'une autre, et la RLS ne voit pas les unicités.
create unique index if not exists uq_risque_quantification_risque
    on risque_quantification (risque_id, filiale_id);

create index if not exists ix_risque_quantification_filiale
    on risque_quantification (filiale_id, perte_annualisee desc nulls last);

drop trigger if exists trg_risque_quantification_maj on risque_quantification;
create trigger trg_risque_quantification_maj before update on risque_quantification
    for each row execute function f_maj_tracabilite();

comment on table risque_quantification is
    'Quantification financière d''un risque selon FAIR (action 25.4) : la fréquence d''un '
    'événement de perte et sa magnitude, chacune estimée par un TRIPLET min / probable / '
    'max, d''où une perte annualisée DÉRIVÉE. ⚠️ Un triplet incomplet ne rend RIEN : la '
    'contrainte refuse la donnée et la dérivation rend NULL — pas d''estimation par '
    'défaut. ⚠️ Cloisonnée et non mixte : un montant de perte dépend de la filiale, et '
    'une quantification de portée Groupe serait lisible de toutes.';
comment on column risque_quantification.devise is
    'ISO 4217. ⚠️ La consolidation REFUSE d''additionner deux devises et rend « null » — '
    'même mécanique qu''aux échelles de la migration 049, et pour la même raison : une '
    'somme de grandeurs non comparables est un nombre, jamais une somme.';
comment on column risque_quantification.hypotheses is
    'LA PIÈCE MAÎTRESSE DU CRITÈRE 25.4 : sans hypothèses écrites, un montant n''est pas '
    'une estimation. « not null » et non vide, ce qui rend la ligne INCRÉABLE sans elles '
    '— plutôt que de laisser un écran masquer le montant, ce qu''un autre oublierait.';
comment on column risque_quantification.secondaire_min is
    'Perte secondaire : amende, litige, client perdu, réputation. FACULTATIVE — et son '
    'absence NE VAUT PAS ZÉRO : elle fait de la perte annualisée un PLANCHER, que '
    '« secondaire_estimee » marque et que l''écran annonce par un « ≥ ».';
comment on column risque_quantification.perte_annualisee is
    'DÉRIVÉE par f_fair_perte_annualisee(), engendrée « always » : aucun appelant ne peut '
    'y écrire. Nulle dès que la fréquence ou la perte primaire est incomplète.';
comment on column risque_quantification.secondaire_estimee is
    'Vrai si les pertes secondaires sont estimées. Faux = la perte annualisée est un '
    'PLANCHER. Engendrée : la tenir à jour à la main, c''est accepter qu''elle mente.';

-- =====================================================================================
-- §2 bis — CE QUE TOUTE TABLE MÉTIER DOIT À TROIS GARDE-FOUS DÉJÀ POSÉS
-- -------------------------------------------------------------------------------------
-- Les trois mêmes qu'à la `049` §2 bis, et pour les mêmes motifs : la marque de
-- provenance (sans quoi la purge du jeu de découverte ne distingue pas une quantification
-- semée d'une quantification décidée), la traçabilité à l'insertion (sans quoi « version »
-- cesse d'être un compteur et le verrouillage optimiste tombe), et le registre de
-- l'article 30 du produit lui-même.
-- =====================================================================================

alter table risque_quantification add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_risque_quantification_provenance on risque_quantification;
create trigger trg_risque_quantification_provenance before insert on risque_quantification
    for each row execute function f_marquer_provenance();

do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Traçabilité à l''insertion : % table(s) équipée(s).', v_poses;
end;
$$;

-- ── Le registre de l'article 30, pour les quatre colonnes textuelles ──────────────────
--
-- ⚠️ **`hypotheses` et `source_donnees` portent le régime « signaler » à l'expiration**,
-- là où les six colonnes de la `049` étaient sans suite. C'est l'écart, et il est
-- délibéré : une hypothèse
-- de quantification s'écrit en prose libre et cite volontiers quelqu'un — *« chiffre
-- confirmé par le directeur financier »*, *« sinistralité relevée par le courtier
-- Untel »*. Le sujet d'une échelle était un BARÈME ; le sujet d'une hypothèse est un
-- raisonnement, et un raisonnement s'appuie sur des gens. Le régime « signaler » dit
-- exactement cela : on ne purge pas à l'aveugle, on signale à l'exploitant qu'un humain
-- doit regarder. C'est le quatrième régime trouvé par un essai le 11/09, sur
-- `crise.notes`, pour ce motif précis.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('risque_quantification', 'devise', 'non_personnelle', null, null, null, null,
   'Code ISO 4217 sur trois capitales. Ne désigne aucune personne.'),
  ('risque_quantification', 'confiance', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : faible | moyenne | élevée. Qualifie une ESTIMATION, pas un '
   'estimateur.'),
  ('risque_quantification', 'hypotheses', 'non_personnelle', null, null, null, 'signaler',
   'Prose libre disant d''où viennent les chiffres. ⚠️ Elle cite volontiers quelqu''un — '
   '« confirmé par le directeur financier », « sinistralité relevée par le courtier » — et '
   'elle est la pièce que l''auditeur lit en premier. On ne la purge donc pas à l''aveugle : '
   'on SIGNALE, et un humain tranche. Même régime que actions.commentaire et crise.notes, '
   'pour le même motif.'),
  ('risque_quantification', 'source_donnees', 'non_personnelle', null, null, null, 'signaler',
   'Provenance des chiffres. Peut nommer un assureur, un courtier, un cabinet — donc une '
   'personne morale, parfois physique. Régime « signaler » pour le même motif que '
   'hypotheses.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §3 — `type_entite`
-- -------------------------------------------------------------------------------------
-- Une table absente de ce domaine est INCRÉABLE par les routes génériques, et le refus
-- qui remonte à l'utilisateur ne désigne rien (`CONVENTIONS.md` §40.1). La substitution
-- part d'un MODÈLE : si le texte appliqué a changé depuis, on REFUSE plutôt que
-- d'appliquer de travers (motif du §4 de la `027`).
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := '''echelle_niveaux''';
    v_ajouts   constant text := '''echelle_niveaux'', ''risque_quantification''';
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
    if position('''risque_quantification''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà la quantification : rejeu, rien à faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « echelle_niveaux » est introuvable dans le prédicat '
                        'appliqué de type_entite_check : son texte a changé, et la '
                        'substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais « risque_quantification ».';
end;
$$;

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Table ordinaire, cloisonnée : le patron du `CONVENTIONS.md` §16, sans le cas « mixte ».
-- =====================================================================================

alter table risque_quantification enable row level security;
alter table risque_quantification force  row level security;

drop policy if exists pol_risque_quantification_lecture on risque_quantification;
drop policy if exists pol_risque_quantification_ajout on risque_quantification;
drop policy if exists pol_risque_quantification_maj on risque_quantification;
drop policy if exists pol_risque_quantification_suppression on risque_quantification;

create policy pol_risque_quantification_lecture on risque_quantification
    for select using (filiale_id = any (f_filiales_lecture()));
create policy pol_risque_quantification_ajout on risque_quantification
    for insert with check (filiale_id = f_filiale_ecriture());
create policy pol_risque_quantification_maj on risque_quantification
    for update using (filiale_id = f_filiale_ecriture())
    with check (filiale_id = f_filiale_ecriture());
create policy pol_risque_quantification_suppression on risque_quantification
    for delete using (filiale_id = f_filiale_ecriture());

comment on policy pol_risque_quantification_lecture on risque_quantification is
    'Strictement cloisonnée, sans cas « portée Groupe » : le coût d''un incident chez une '
    'filiale n''a pas à être lisible de sa voisine. La vision Groupe passe par '
    'f_filiales_lecture(), qui borne au périmètre résolu par le serveur.';

grant select, insert, update, delete on risque_quantification to grc_app;
grant select on risque_quantification to grc_lecture;

select f_armer_declencheurs();

-- ⚠️ APRÈS le §4 : `f_poser_declencheurs_pieces()` découvre ses tables porteuses par un
-- prédicat dont l'une des conditions est que la politique de SUPPRESSION soit cloisonnée.
-- Appelée plus haut, elle ne verrait pas la table neuve et la laisserait démunie sans une
-- erreur (`CONVENTIONS.md` §40.2).
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §5 — ⚠️ LE GARDE-FOU DU LOT, ÉLARGI : IL MESURE, IL NE RECONNAÎT PLUS UN NOM
-- -------------------------------------------------------------------------------------
-- **Ce paragraphe ne parle pas de quantification, et c'est le plus important des sept.**
--
-- `f_verifier_ebios_cadrage()` tient depuis la migration `046` la garantie centrale du lot
-- L25 : *aucun traitement automatique ne réinterprète la cotation F × G × M*. Son sixième
-- contrôle balayait les tables dont le **nom** commence par `ebios_`.
--
-- La table créée au §2 s'appelle `risque_quantification`. Elle lui échappait.
--
-- ⚠️ **Et le mode de défaillance est le pire de tous** : un garde qui ne regarde pas rend
-- *zéro anomalie*, c'est-à-dire exactement ce qu'il rend quand tout va bien. Personne
-- n'aurait vu la garantie disparaître ; on aurait continué à citer son verdict vert comme
-- preuve que « en addition » tenait — ce qui est arrivé trois fois sur ce chantier, et a
-- coûté le constat **Q-281** (deux barrières mortes, leur verdict cité dans trois
-- documents).
--
-- ── CE QUI EST REMPLACÉ, ET COMMENT ───────────────────────────────────────────────
--
-- La fonction est **reposée en entier**, à l'identique de la `046` sauf son sixième
-- contrôle. ⚠️ Le texte ci-dessous n'a pas été retapé : il a été extrait du catalogue
-- (`pg_get_functiondef`) et une seule substitution y a été appliquée, refusée si le bloc
-- visé n'était pas retrouvé mot pour mot. *On ne remplace pas une fonction dont on n'a lu
-- qu'une partie* — la faute du 10/09/2026, qui avait perdu la mise en file de
-- `pieces_a_purger` et n'a été rattrapée que par trois essais.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_ebios_cadrage()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- Les cas témoins de la dérivation. Le troisième et le quatrième sont ceux qui
    -- comptent : ils tiennent le « pas d'estimation par défaut ».
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('m', 4, 'r', 4, 'a', 4, 'attendu', 4,
            'effet', 'la pertinence d''un couple maximal cesserait d''être maximale, et '
                     'l''atelier 2 classerait les couples à l''envers'),
        jsonb_build_object('m', 1, 'r', 1, 'a', 1, 'attendu', 1,
            'effet', 'la pertinence d''un couple minimal cesserait d''être minimale'),
        jsonb_build_object('m', 4, 'r', 1, 'a', 1, 'attendu', 2,
            'effet', 'la moyenne des trois critères ne serait plus la moyenne : un '
                     'attaquant très motivé mais sans moyens passerait devant un attaquant '
                     'outillé et actif'),
        jsonb_build_object('m', null, 'r', 4, 'a', 4, 'attendu', null,
            'effet', 'LE PRODUIT INVENTERAIT UNE PERTINENCE À PARTIR DE DEUX CRITÈRES SUR '
                     'TROIS. C''est le défaut que le critère 25.4 nomme : un chiffre qui a '
                     'l''air mesuré sans l''être est pire que pas de chiffre, parce qu''il '
                     'est cité en comité de direction'),
        jsonb_build_object('m', 4, 'r', null, 'a', 4, 'attendu', null,
            'effet', 'idem : un critère absent doit taire la suggestion, quel qu''il soit'),
        jsonb_build_object('m', 4, 'r', 4, 'a', null, 'attendu', null,
            'effet', 'idem : un critère absent doit taire la suggestion, quel qu''il soit')
    );
    v_cas_un jsonb;
    v_rendu  smallint;
    v_attendu smallint;

    -- Les pièces nommées des §1 à §5. ⚠️ UNE PAR UNE : la disparition d'une PAIRE (une
    -- clé composite, une contrainte liée à un genre) ne se voit pas d'un garde de classe.
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('t','ebios_valeurs_metier','n','fk_ebios_valeurs_metier_etude',
            'e','le rattachement d''une valeur métier à son étude n''est plus cloisonné : '
                'une ligne INVISIBLE de la filiale voisine satisfait la clé (§17.1), et '
                'l''on rattache son travail à une étude qu''on ne voit pas'),
        jsonb_build_object('t','ebios_valeurs_metier','n','fk_ebios_valeurs_metier_processus',
            'e','le lien vers le processus du BIA n''est plus cloisonné : une valeur '
                'métier pointerait un processus INVISIBLE d''une autre filiale, et '
                'l''écran afficherait sa criticité — une fuite entre filiales'),
        jsonb_build_object('t','ebios_valeurs_metier','n','ck_ebios_valeurs_metier_lien',
            'e','une valeur métier de nature « information » pourrait désigner un '
                'processus : la nature cesserait de vouloir dire quoi que ce soit'),
        jsonb_build_object('t','ebios_evenements_redoutes','n','fk_ebios_evenements_redoutes_valeur',
            'e','un événement redouté peut se rattacher à une valeur métier INVISIBLE de '
                'la filiale voisine'),
        jsonb_build_object('t','ebios_evenements_redoutes','n','ck_ebios_evenements_redoutes_besoin',
            'e','le besoin de sécurité n''est plus au vocabulaire DICP : les événements '
                'redoutés ne se regroupent plus, et l''atelier 1 perd sa synthèse'),
        jsonb_build_object('t','ebios_sources_risque','n','fk_ebios_sources_risque_etude',
            'e','un couple source/objectif peut se rattacher à une étude INVISIBLE de la '
                'filiale voisine'),
        jsonb_build_object('t','ebios_sources_risque','n','ck_ebios_sources_risque_retenue',
            'e','UN COUPLE PEUT ÊTRE RETENU SANS JUSTIFICATION. Les ateliers 3 et 4 ne '
                'travaillent que sur les couples retenus : la décision qui engage toute la '
                'suite de l''étude deviendrait intraçable, et c''est la pièce qu''un '
                'auditeur demande en premier'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_genre',
            'e','le genre d''une entrée de la base de connaissances n''est plus fermé : '
                'l''atelier 2 se verrait proposer des modes opératoires et l''atelier 4 '
                'des sources de risque'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_phase',
            'e','un mode opératoire pourrait porter une phase hors du vocabulaire de '
                'l''atelier 4, et l''écran ne saurait plus les regrouper'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_phase_genre',
            'e','une SOURCE DE RISQUE pourrait porter une phase : « genre » ne serait '
                'plus qu''une étiquette, et l''atelier 2 se verrait proposer des modes '
                'opératoires'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_objectif',
            'e','un objectif visé vide devient possible — or c''est la moitié du couple '
                'que l''atelier 2 instancie'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_objectif_genre',
            'e','un MODE OPÉRATOIRE pourrait porter un objectif visé : même effet que '
                'ci-dessus, dans l''autre sens'),
        jsonb_build_object('t','processus','n','uq_processus_id_filiale',
            'e','la cible de la clé composite vers « processus » disparaît — et avec elle '
                'la seule chose qui empêche une clé SIMPLE d''être satisfaite par un '
                'processus invisible de la filiale voisine')
    );
    v_piece jsonb;

    -- ⚠️ LES CINQ COLONNES DE LA COTATION HÉRITÉE. C'est le critère 25.1, rendu mécanique.
    v_cotation constant text[] := array['f_frequence', 'g_gravite', 'm_maitrise',
                                        'score_brut', 'score_residuel'];
    v_colonne text;
    -- Les cinq tables du lot, nommées UNE PAR UNE pour le contrôle du domaine (§5) :
    -- une table absente de `type_entite` est INCRÉABLE, et le refus qui remonte à
    -- l'utilisateur ne désigne rien (`CONVENTIONS.md` §40.1).
    v_table   text;
begin
    -- ── 1. La dérivation existe-t-elle seulement ? ──────────────────────────────────
    if to_regprocedure('public.f_ebios_pertinence(smallint, smallint, smallint)') is null then
        objet    := 'f_ebios_pertinence';
        anomalie := 'derivation_pertinence_absente';
        detail   := 'La fonction qui suggère la pertinence d''un couple source/objectif a '
                    'disparu. L''atelier 2 n''a plus d''aide au classement — et, pire, un '
                    'appelant pourrait en réécrire une seconde ailleurs, qui divergerait.';
        return next;
        return;
    end if;

    -- ── 2. LA DÉRIVATION EST ÉPROUVÉE, pas lue (§39.1) ─────────────────────────────
    for v_cas_un in select * from jsonb_array_elements(v_cas) loop
        v_attendu := (v_cas_un ->> 'attendu')::smallint;
        v_rendu   := f_ebios_pertinence((v_cas_un ->> 'm')::smallint,
                                        (v_cas_un ->> 'r')::smallint,
                                        (v_cas_un ->> 'a')::smallint);
        if v_rendu is distinct from v_attendu then
            objet    := 'f_ebios_pertinence';
            anomalie := 'derivation_pertinence_fausse';
            detail   := format(
                'Motivation « %s », ressources « %s », activité « %s » : la fonction rend '
                '« %s » au lieu de « %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE '
                'la dérivation sur des valeurs témoins — il ne lit pas le texte de la '
                'fonction (§39.1).',
                coalesce(v_cas_un ->> 'm', '(null)'),
                coalesce(v_cas_un ->> 'r', '(null)'),
                coalesce(v_cas_un ->> 'a', '(null)'),
                coalesce(v_rendu::text, '(null)'),
                coalesce(v_attendu::text, '(null)'),
                v_cas_un ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 3. Les pièces nommées ───────────────────────────────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.' || (v_piece ->> 't'))
               and c.conname = v_piece ->> 'n'
               -- ⚠️ `convalidated` : une contrainte reposée « not valid » garde son
               -- prédicat et n'a JAMAIS vérifié les lignes déjà en base — constat Q-319.
               and c.convalidated)
        then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'ebios_piece_manquante';
            detail   := format(
                'Cette pièce des ateliers EBIOS RM a disparu ou n''est pas validée. Ce que '
                'sa disparition rouvre : %s.', v_piece ->> 'e');
            return next;
        end if;
    end loop;

    -- ── 4. ⚠️ LA COTATION HÉRITÉE EST INTACTE — le critère 25.1, rendu mécanique ────
    --
    -- *« Les risques cotés en F × G × M restent valides et lisibles. Une migration qui les
    -- réinterpréterait réattribuerait EN SILENCE des cotations produites en audit. »*
    -- Ce contrôle est ici parce qu'une phrase dans un plan ne retient personne : c'est le
    -- motif du constat Q-192, et celui de toute la §39 du CONVENTIONS.md.
    foreach v_colonne in array v_cotation loop
        if not exists (
            select 1 from pg_attribute a
             where a.attrelid = to_regclass('public.risques')
               and a.attname = v_colonne and a.attnum > 0 and not a.attisdropped)
        then
            objet    := 'risques.' || v_colonne;
            anomalie := 'cotation_heritee_perdue';
            detail   := format(
                'La colonne « %s » de la cotation F × G × M a disparu de « risques ». '
                'L''action 25.1 se fait EN ADDITION, jamais en remplacement : les risques '
                'déjà cotés ont été produits en audit, et les réinterpréter les '
                'réattribuerait EN SILENCE. C''est le motif qui a fait refuser la '
                'renumérotation du catalogue ANSSI (constat Q-192).', v_colonne);
            return next;
        end if;
    end loop;

    -- ── 4 bis. ⚠️ LE « set null » NE NULLIFIE QUE `processus_id` ───────────────────
    --
    -- Sans sa liste de colonnes, PostgreSQL met à NULL **toutes** les colonnes de la
    -- clé — `filiale_id` comprise, qui est `not null`. Supprimer un processus RÉFÉRENCÉ
    -- échoue alors en 23502, et la purge de `POST /api/reprise` en mode « remplacer »
    -- avec elle : **toute restauration de sauvegarde tombe**.
    --
    -- Le garde MESURE la liste dans le catalogue (`confdelsetcols`) au lieu de se fier au
    -- texte de la migration : c'est la règle du §39.1, et c'est aussi la seule façon de
    -- voir qu'une migration ultérieure a reposé la clé sans elle.
    if exists (
        select 1
          from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'processus_id'
                             and a.attnum > 0 and not a.attisdropped
         where c.conrelid = to_regclass('public.ebios_valeurs_metier')
           and c.conname = 'fk_ebios_valeurs_metier_processus'
           and c.confdeltype = 'n'
           and c.confdelsetcols is distinct from array[a.attnum])
    then
        objet    := 'ebios_valeurs_metier.fk_ebios_valeurs_metier_processus';
        anomalie := 'ebios_set_null_trop_large';
        detail   := 'Le « on delete set null » de cette clé ne se limite pas à '
                    '« processus_id ». PostgreSQL met alors à NULL toutes les colonnes de '
                    'la clé, « filiale_id » comprise — et elle est « not null ». '
                    'Supprimer un processus RÉFÉRENCÉ échoue en 23502, la purge de '
                    '« remplacer » avec lui, et TOUTE RESTAURATION DE SAUVEGARDE TOMBE. '
                    'Le message remis à l''utilisateur parle alors d''un champ '
                    '« filiale_id » obligatoire sur une opération qui n''écrit rien de tel.';
        return next;
    end if;

    -- ── 5. LES CINQ TABLES SONT DÉSIGNABLES PAR « type_entite » ────────────────────
    --
    -- Sans cela elles sont INCRÉABLES : toute création écrit au journal, et
    -- `journal_audit.entite_type` porte ce domaine (`CONVENTIONS.md` §40.1). Le refus
    -- arrive à l'utilisateur en `400 « Une valeur de l'enregistrement n'est pas admise »`,
    -- qui ne désigne rien.
    --
    -- ⚠️ **Le contrôle est ici et pas seulement au banc**, alors que
    -- `test/base/vocabulaire.test.mjs` confronte déjà ce domaine au registre applicatif :
    -- le banc ne tourne pas sur la machine du client, et `f_verifier_schema()` si. Un
    -- domaine amputé par une migration future doit refuser le DÉPLOIEMENT, pas attendre
    -- qu'un développeur rejoue le banc.
    foreach v_table in array array['ebios_connaissances', 'ebios_etudes',
                                   'ebios_valeurs_metier', 'ebios_evenements_redoutes',
                                   'ebios_sources_risque']
    loop
        begin
            -- ⚠️ On ÉPROUVE le domaine — on ne lit pas le texte de son prédicat (§39.1).
            -- Un garde qui chercherait la sous-chaîne passerait au vert sur un prédicat
            -- devenu « … or true », qui admet tout et ne garantit rien (constat Q-312).
            perform v_table::type_entite;
        exception when others then
            objet    := v_table;
            anomalie := 'ebios_entite_non_designable';
            detail   := format(
                'Le domaine « type_entite » n''admet pas « %s » : la table est INCRÉABLE, '
                'parce que toute création écrit au journal et que journal_audit.entite_type '
                'porte ce domaine. Le refus arrive à l''utilisateur en 400 « Une valeur de '
                'l''enregistrement n''est pas admise », qui ne désigne rien '
                '(CONVENTIONS.md §40.1).', v_table);
            return next;
        end;
    end loop;

    -- ── 6. ⚠️ AUCUNE TABLE N'ÉCRIT DANS « risques » — ÉLARGI PAR LA MIGRATION `050`
    --
    -- ⚠️ **CE CONTRÔLE NE RECONNAISSAIT QU'UN NOM, ET C'ÉTAIT LE DÉFAUT.** Sa rédaction
    -- d'origine (migration `046`) ne balayait que les tables dont le NOM commence par
    -- `ebios_`. La garantie centrale du lot L25 — *« en addition, jamais en
    -- remplacement »* — cessait donc de s'appliquer à toute table nommée autrement, et
    -- elle cessait **sans que rien ne le dise** : le garde rendait zéro anomalie, ce qui
    -- est aussi ce qu'il rend quand tout va bien.
    --
    -- Le piège a été mesuré AVANT d'écrire la table `risque_quantification` de l'action
    -- 25.4, qui lui échappait exactement — et le `docs/PLAN_PRODUIT.md` nommait les deux
    -- issues : renommer la table pour entrer dans le motif, ou élargir le garde à ce
    -- qu'il MESURE. La seconde est retenue, parce que la première aurait laissé le piège
    -- en place pour la table suivante.
    --
    -- C'est la règle du `CONVENTIONS.md` §39 retournée contre elle-même une fois de plus
    -- — *reconnaître un NOM au lieu de mesurer ce qu'une chose FAIT* —, et c'est mot pour
    -- mot le motif des constats **Q-312** et **Q-313**.
    --
    -- ⚠️ **Le balayage part désormais du CATALOGUE ENTIER**, `risques` elle-même
    -- comprise : un déclencheur posé SUR `risques` qui « normaliserait » une cotation la
    -- réattribuerait tout autant, et c'est le même défaut vu d'un cran plus près.
    for v_table in
        select c.relname::text
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         where c.relkind = 'r'
           and exists (
                 select 1 from pg_trigger t
                   join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = c.oid and not t.tgisinternal
                    and p.prosrc ~* '\m(update|insert\s+into|delete\s+from)\s+risques\M')
         order by 1
    loop
        objet    := v_table;
        anomalie := 'ebios_ecrit_dans_risques';
        detail   := 'Un déclencheur de cette table écrit dans « risques ». C''est '
                    'exactement ce que le critère 25.1 refuse : les cotations F × G × M '
                    'ont été produites en audit, et un traitement qui les réinterprète les '
                    'réattribue EN SILENCE. Les deux méthodes de cotation cohabitent sans '
                    'se parler ; le lien entre un scénario opérationnel et un risque coté '
                    'est un LIEN, pas une conversion. ⚠️ Ce balayage part du catalogue '
                    'ENTIER depuis la migration 050 : sa rédaction d''origine ne '
                    'reconnaissait que les tables nommées « ebios_… », et la table de '
                    'quantification lui échappait sans que rien ne le dise.';
        return next;
    end loop;

    return;
end;
$function$;


comment on function f_verifier_ebios_cadrage() is
    'Garde-fou du lot L25 : la dérivation de la pertinence est ÉPROUVÉE sur six cas '
    'témoins (§39.1), les pièces du schéma sont nommées UNE PAR UNE (§39.7), la cotation '
    'F × G × M héritée est mesurée INTACTE colonne par colonne, et — depuis la migration '
    '050 — AUCUN déclencheur du schéma ENTIER n''écrit dans « risques ». ⚠️ Ce dernier '
    'contrôle ne balayait que les tables nommées « ebios_… » : la table de quantification '
    'de l''action 25.4 lui échappait, et la garantie centrale du lot aurait cessé de '
    's''appliquer sans que rien ne le dise. Reconnaître un NOM au lieu de mesurer ce '
    'qu''une chose FAIT — motif des constats Q-312 et Q-313, CONVENTIONS.md §39. '
    'Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §6 — LE GARDE-FOU DE LA QUANTIFICATION
-- -------------------------------------------------------------------------------------
-- ⚠️ Il **ÉPROUVE** la dérivation au lieu de relire son texte (`CONVENTIONS.md` §39.1),
-- et il nomme ses pièces **une par une** (§39.7) : un garde de classe ne voit pas la
-- disparition d'une PAIRE.
--
-- Ses cas témoins ne sont pas décoratifs. Les quatre derniers tiennent, à eux seuls, tout
-- le critère 25.4 :
--
--   • un triplet à deux valeurs ne rend RIEN — pas la moyenne des deux ;
--   • une fréquence complète et une perte absente ne rendent RIEN — pas la fréquence ;
--   • une perte secondaire absente ne vaut pas zéro : elle rend un PLANCHER, et la marque
--     qui le dit doit suivre ;
--   • et la moyenne PERT est bien la moyenne PERT — un « / 3 » au lieu d'un « / 6 »
--     doublerait toutes les pertes annualisées du groupe, sous une forme parfaitement
--     plausible.
-- =====================================================================================

create or replace function f_verifier_quantification_fair()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- ── Les cas témoins de la moyenne PERT ────────────────────────────────────────
    v_pert constant jsonb := jsonb_build_array(
        jsonb_build_object('min', 0, 'prob', 0, 'max', 0, 'attendu', 0,
            'effet', 'la moyenne d''un triplet nul cesserait d''être nulle'),
        jsonb_build_object('min', 1, 'prob', 1, 'max', 1, 'attendu', 1,
            'effet', 'la moyenne d''un triplet constant cesserait d''être cette constante '
                     '— le cas le plus simple, et celui qu''une rédaction fautive du '
                     'dénominateur casse en premier'),
        jsonb_build_object('min', 0, 'prob', 3, 'max', 6, 'attendu', 3,
            'effet', 'la moyenne d''un triplet symétrique cesserait d''être sa valeur '
                     'centrale'),
        jsonb_build_object('min', 1, 'prob', 2, 'max', 9, 'attendu', 3,
            'effet', 'LA PONDÉRATION PERT SERAIT PERDUE. C''est le cas discriminant : '
                     'une moyenne arithmétique rendrait 4, la moyenne PERT rend 3. Un '
                     '« / 3 » au lieu du « / 6 » doublerait toutes les pertes annualisées '
                     'du groupe, sous une forme parfaitement plausible'),
        jsonb_build_object('min', null, 'prob', 2, 'max', 9, 'attendu', null,
            'effet', 'UN TRIPLET À DEUX VALEURS RENDRAIT UN NOMBRE. C''est le défaut que '
                     'le critère 25.4 nomme : un chiffre qui a l''air mesuré sans l''être '
                     'est pire que pas de chiffre, parce qu''il est cité en comité de '
                     'direction'),
        jsonb_build_object('min', 1, 'prob', null, 'max', 9, 'attendu', null,
            'effet', 'idem : l''estimation centrale est celle qui pèse quatre sixièmes, '
                     'son absence ne se rattrape pas'),
        jsonb_build_object('min', 1, 'prob', 2, 'max', null, 'attendu', null,
            'effet', 'idem : une borne haute absente rendrait la perte maximale égale à '
                     'l''estimation centrale, c''est-à-dire optimiste par construction')
    );
    -- ── Les cas témoins de la perte annualisée ────────────────────────────────────
    -- Chaque entrée : fréquence (3), perte primaire (3), perte secondaire (3), attendu.
    v_ale constant jsonb := jsonb_build_array(
        jsonb_build_object('f', jsonb_build_array(1, 1, 1), 'p', jsonb_build_array(100, 100, 100),
            's', jsonb_build_array(null, null, null), 'attendu', 100,
            'effet', 'un événement par an coûtant cent cesserait de coûter cent par an'),
        jsonb_build_object('f', jsonb_build_array(0, 2, 4), 'p', jsonb_build_array(0, 1000, 2000),
            's', jsonb_build_array(null, null, null), 'attendu', 2000,
            'effet', 'le produit des deux moyennes cesserait d''être le produit des deux '
                     'moyennes'),
        jsonb_build_object('f', jsonb_build_array(1, 1, 1), 'p', jsonb_build_array(100, 100, 100),
            's', jsonb_build_array(50, 50, 50), 'attendu', 150,
            'effet', 'LA PERTE SECONDAIRE CESSERAIT D''ÊTRE COMPTÉE. L''amende du '
                     'régulateur, le litige et le client perdu disparaîtraient du '
                     'montant — et pour un produit de conformité NIS2, DORA et RGPD, '
                     'c''est le terme le plus gros'),
        jsonb_build_object('f', jsonb_build_array(null, null, null), 'p', jsonb_build_array(100, 100, 100),
            's', jsonb_build_array(null, null, null), 'attendu', null,
            'effet', 'UNE PERTE ANNUALISÉE SERAIT RENDUE SANS FRÉQUENCE. Le montant '
                     'affiché serait celui d''UN événement présenté comme un coût ANNUEL '
                     '— une confusion d''unité, invisible à l''écran'),
        jsonb_build_object('f', jsonb_build_array(1, 1, 1), 'p', jsonb_build_array(null, null, null),
            's', jsonb_build_array(50, 50, 50), 'attendu', null,
            'effet', 'LA PERTE SECONDAIRE SEULE SERAIT PRÉSENTÉE COMME LE TOTAL. Sans '
                     'perte primaire estimée, il n''y a pas de total : il y a une amende '
                     'sans le sinistre qui la déclenche'),
        jsonb_build_object('f', jsonb_build_array(2, 2, 2), 'p', jsonb_build_array(10, 10, 10),
            's', jsonb_build_array(null, 5, 5), 'attendu', 20,
            'effet', 'UN TRIPLET SECONDAIRE INCOMPLET SERAIT COMPTÉ À MOITIÉ. La '
                     'contrainte du §2 refuse d''écrire un tel triplet, mais la fonction '
                     'est appelable ailleurs — et une barrière posée à un seul étage est '
                     'une barrière qu''un chemin contourne')
    );
    v_cas     jsonb;
    v_rendu   numeric;
    v_attendu numeric;

    -- ── Les pièces nommées UNE PAR UNE ────────────────────────────────────────────
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('n','fk_risque_quantification_risque',
            'e','le rattachement au risque n''est plus cloisonné : une clé SIMPLE est '
                'satisfaite par un risque INVISIBLE de la filiale voisine (§17.1), et la '
                'quantification d''un incident se retrouverait accrochée au risque d''une '
                'autre filiale'),
        jsonb_build_object('n','ck_risque_quantification_triplet_frequence',
            'e','UN TRIPLET DE FRÉQUENCE À DEUX VALEURS DEVIENDRAIT ÉCRIVABLE. La '
                'dérivation le taira, mais la ligne existera avec une estimation à moitié '
                'saisie que l''écran présentera comme une estimation'),
        jsonb_build_object('n','ck_risque_quantification_triplet_perte',
            'e','idem pour la perte primaire'),
        jsonb_build_object('n','ck_risque_quantification_triplet_secondaire',
            'e','idem pour la perte secondaire — et c''est la plus dangereuse des trois, '
                'parce que son absence est LICITE : rien ne distingue alors « non '
                'estimée » de « saisie à moitié »'),
        jsonb_build_object('n','ck_risque_quantification_ordre_frequence',
            'e','un minimum supérieur au maximum deviendrait écrivable, et la moyenne '
                'PERT qui en sort n''a aucun sens tout en ayant l''air d''un nombre'),
        jsonb_build_object('n','ck_risque_quantification_ordre_perte',
            'e','idem pour la perte primaire'),
        jsonb_build_object('n','ck_risque_quantification_ordre_secondaire',
            'e','idem pour la perte secondaire'),
        jsonb_build_object('n','ck_risque_quantification_hypotheses',
            'e','UN MONTANT SANS HYPOTHÈSES DEVIENDRAIT ÉCRIVABLE. C''est le critère '
                '25.4 mot pour mot : « une valeur en euros n''est affichée QUE si ses '
                'hypothèses sont saisies ». Sans la contrainte, la règle retomberait sur '
                'l''écran — et un second écran l''oublierait'),
        jsonb_build_object('n','ck_risque_quantification_devise',
            'e','une devise hors ISO 4217 deviendrait écrivable, et la consolidation '
                'compterait deux devises là où il n''y en a qu''une mal saisie : '
                'l''exposition du groupe passerait à « null » sans cause visible'),
        jsonb_build_object('n','ck_risque_quantification_frequence_bornes',
            'e','une fréquence négative deviendrait écrivable : le produit changerait de '
                'signe et l''écran afficherait un risque qui RAPPORTE de l''argent'),
        jsonb_build_object('n','ck_risque_quantification_perte_bornes',
            'e','une perte négative deviendrait écrivable — même effet, et il se propage '
                'à la somme consolidée du groupe'),
        jsonb_build_object('n','ck_risque_quantification_secondaire_bornes',
            'e','idem pour la perte secondaire'),
        jsonb_build_object('n','uq_risque_quantification_risque',
            'e','UN RISQUE POURRAIT PORTER DEUX QUANTIFICATIONS. Les deux seraient '
                'sommées par la consolidation, et le montant du groupe compterait le même '
                'sinistre deux fois'),
        jsonb_build_object('n','ck_risque_quantification_confiance',
            'e','le vocabulaire de la confiance n''est plus clos : l''écran ne sait plus '
                'regrouper, et deux mots différents désignent la même chose')
    );
    v_piece jsonb;
    v_colonne text;
    v_accepte boolean;

    -- ── Les lignes TÉMOINS que chaque contrainte doit REFUSER ─────────────────────
    -- ⚠️ Elles ne sont pas insérées : `f_contrainte_accepte()` évalue le prédicat réel
    -- sur une ligne construite en mémoire. C'est ce qui permet à ce garde de mordre
    -- SANS lire ni écrire une ligne de la table — règle du `CONVENTIONS.md` §41, que
    -- `install.sh` impose en appelant `f_verifier_schema()` sans aucun périmètre.
    v_temoins constant jsonb := jsonb_build_array(
        jsonb_build_object('n','ck_risque_quantification_triplet_frequence',
            'ligne', jsonb_build_object('frequence_min', 1, 'frequence_probable', 2),
            'e','un triplet de fréquence à deux valeurs devient écrivable'),
        jsonb_build_object('n','ck_risque_quantification_triplet_perte',
            'ligne', jsonb_build_object('perte_min', 1, 'perte_probable', 2),
            'e','un triplet de perte primaire à deux valeurs devient écrivable'),
        jsonb_build_object('n','ck_risque_quantification_triplet_secondaire',
            'ligne', jsonb_build_object('secondaire_min', 1, 'secondaire_probable', 2),
            'e','un triplet de perte secondaire à deux valeurs devient écrivable — et '
                'rien ne le distingue alors de « non estimée », qui est licite'),
        jsonb_build_object('n','ck_risque_quantification_ordre_frequence',
            'ligne', jsonb_build_object('frequence_min', 9, 'frequence_probable', 2,
                                        'frequence_max', 3),
            'e','un minimum supérieur au maximum devient écrivable'),
        jsonb_build_object('n','ck_risque_quantification_ordre_perte',
            'ligne', jsonb_build_object('perte_min', 9, 'perte_probable', 2, 'perte_max', 3),
            'e','idem sur la perte primaire'),
        jsonb_build_object('n','ck_risque_quantification_ordre_secondaire',
            'ligne', jsonb_build_object('secondaire_min', 9, 'secondaire_probable', 2,
                                        'secondaire_max', 3),
            'e','idem sur la perte secondaire'),
        jsonb_build_object('n','ck_risque_quantification_hypotheses',
            'ligne', jsonb_build_object('hypotheses', ''),
            'e','UN MONTANT SANS HYPOTHÈSES devient écrivable — le critère 25.4 mot pour '
                'mot, et la règle retomberait sur les écrans'),
        jsonb_build_object('n','ck_risque_quantification_devise',
            'ligne', jsonb_build_object('devise', 'euros'),
            'e','une devise hors ISO 4217 devient écrivable, et la consolidation compte '
                'deux devises là où il n''y en a qu''une mal saisie'),
        jsonb_build_object('n','ck_risque_quantification_confiance',
            'ligne', jsonb_build_object('confiance', 'moyen'),
            'e','le vocabulaire de la confiance cesse d''être clos'),
        jsonb_build_object('n','ck_risque_quantification_frequence_bornes',
            'ligne', jsonb_build_object('frequence_min', -1, 'frequence_probable', 0,
                                        'frequence_max', 1),
            'e','UNE FRÉQUENCE NÉGATIVE devient écrivable : le produit change de signe, '
                'et l''écran affiche un risque qui RAPPORTE de l''argent'),
        jsonb_build_object('n','ck_risque_quantification_perte_bornes',
            'ligne', jsonb_build_object('perte_min', -1, 'perte_probable', 0, 'perte_max', 1),
            'e','une perte négative devient écrivable, et elle se propage à la somme '
                'consolidée du groupe'),
        jsonb_build_object('n','ck_risque_quantification_secondaire_bornes',
            'ligne', jsonb_build_object('secondaire_min', -1, 'secondaire_probable', 0,
                                        'secondaire_max', 1),
            'e','idem sur la perte secondaire'),
        jsonb_build_object('n','ck_risque_quantification_longueurs',
            'ligne', jsonb_build_object('hypotheses', repeat('x', 4001)),
            'e','la borne de saisie tombe — contrôle S13')
    );

    -- La ligne parfaitement ordinaire que TOUTES les contraintes doivent accepter.
    v_ligne_valide constant jsonb := jsonb_build_object(
        'devise', 'EUR',
        'frequence_min', 1, 'frequence_probable', 2, 'frequence_max', 4,
        'perte_min', 500, 'perte_probable', 1000, 'perte_max', 5000,
        'secondaire_min', 100, 'secondaire_probable', 200, 'secondaire_max', 900,
        'confiance', 'moyenne',
        'hypotheses', 'Sinistralité relevée sur les trois derniers exercices.');
begin
    -- ── 1. LES DEUX DÉRIVATIONS EXISTENT-ELLES SEULEMENT ? ─────────────────────────
    if to_regprocedure('public.f_fair_moyenne_pert(numeric, numeric, numeric)') is null then
        objet    := 'f_fair_moyenne_pert';
        anomalie := 'derivation_pert_absente';
        detail   := 'La moyenne PERT a disparu. La colonne engendrée « perte_annualisee » '
                    'l''appelle : sans elle, la table entière est incalculable.';
        return next;
        return;
    end if;
    if to_regprocedure('public.f_fair_perte_annualisee(numeric, numeric, numeric, numeric, '
                       'numeric, numeric, numeric, numeric, numeric)') is null then
        objet    := 'f_fair_perte_annualisee';
        anomalie := 'derivation_ale_absente';
        detail   := 'La dérivation de la perte annualisée a disparu.';
        return next;
        return;
    end if;

    -- ── 2. LA MOYENNE PERT EST ÉPROUVÉE, pas lue (§39.1) ───────────────────────────
    for v_cas in select * from jsonb_array_elements(v_pert) loop
        v_attendu := (v_cas ->> 'attendu')::numeric;
        v_rendu   := f_fair_moyenne_pert((v_cas ->> 'min')::numeric,
                                         (v_cas ->> 'prob')::numeric,
                                         (v_cas ->> 'max')::numeric);
        if v_rendu is distinct from v_attendu then
            objet    := 'f_fair_moyenne_pert';
            anomalie := 'moyenne_pert_fausse';
            detail   := format(
                'Triplet (« %s », « %s », « %s ») : la fonction rend « %s » au lieu de '
                '« %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE la dérivation sur '
                'des valeurs témoins — il ne lit pas le texte de la fonction (§39.1).',
                coalesce(v_cas ->> 'min', '(null)'), coalesce(v_cas ->> 'prob', '(null)'),
                coalesce(v_cas ->> 'max', '(null)'),
                coalesce(v_rendu::text, '(null)'), coalesce(v_attendu::text, '(null)'),
                v_cas ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 3. LA PERTE ANNUALISÉE EST ÉPROUVÉE ────────────────────────────────────────
    for v_cas in select * from jsonb_array_elements(v_ale) loop
        v_attendu := (v_cas ->> 'attendu')::numeric;
        v_rendu   := f_fair_perte_annualisee(
            (v_cas -> 'f' ->> 0)::numeric, (v_cas -> 'f' ->> 1)::numeric, (v_cas -> 'f' ->> 2)::numeric,
            (v_cas -> 'p' ->> 0)::numeric, (v_cas -> 'p' ->> 1)::numeric, (v_cas -> 'p' ->> 2)::numeric,
            (v_cas -> 's' ->> 0)::numeric, (v_cas -> 's' ->> 1)::numeric, (v_cas -> 's' ->> 2)::numeric);
        if v_rendu is distinct from v_attendu then
            objet    := 'f_fair_perte_annualisee';
            anomalie := 'perte_annualisee_fausse';
            detail   := format(
                'Fréquence %s, perte %s, secondaire %s : la fonction rend « %s » au lieu '
                'de « %s ». Ce que cela produit : %s.',
                v_cas -> 'f', v_cas -> 'p', v_cas -> 's',
                coalesce(v_rendu::text, '(null)'), coalesce(v_attendu::text, '(null)'),
                v_cas ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 4. LA TABLE EXISTE, ET SES DEUX COLONNES DÉRIVÉES SONT ENGENDRÉES ──────────
    --
    -- ⚠️ « engendrée » n'est pas un détail d'écriture : c'est ce qui rend la colonne
    -- INÉCRIVABLE par un appelant. Une colonne ordinaire portant le même nom serait
    -- remplie par la couche d'écriture à partir de ce que le navigateur envoie — et le
    -- montant affiché cesserait d'être celui que les hypothèses produisent.
    if to_regclass('public.risque_quantification') is null then
        objet    := 'risque_quantification';
        anomalie := 'table_quantification_absente';
        detail   := 'La table de quantification financière a disparu (action 25.4).';
        return next;
        return;
    end if;

    foreach v_colonne in array array['perte_annualisee', 'secondaire_estimee'] loop
        if not exists (
            select 1 from pg_attribute a
             where a.attrelid = to_regclass('public.risque_quantification')
               and a.attname = v_colonne and a.attnum > 0 and not a.attisdropped
               and a.attgenerated = 's')
        then
            objet    := 'risque_quantification.' || v_colonne;
            anomalie := 'colonne_derivee_non_engendree';
            detail   := format(
                'La colonne « %s » n''est plus engendrée « stored ». Elle devient donc '
                'ÉCRIVABLE par un appelant : la couche d''écriture la remplirait à partir '
                'de ce que le navigateur envoie, et le montant cesserait d''être celui que '
                'les hypothèses produisent. Le défaut ne se verrait nulle part — le '
                'nombre aurait toujours l''air calculé.', v_colonne);
            return next;
        end if;
    end loop;

    -- ── 5. LES PIÈCES NOMMÉES, UNE PAR UNE (§39.7) ─────────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (select 1 from pg_constraint
                        where conrelid = to_regclass('public.risque_quantification')
                          and conname = v_piece ->> 'n')
           and not exists (select 1 from pg_class
                            where relname = v_piece ->> 'n' and relkind = 'i')
        then
            objet    := 'risque_quantification.' || (v_piece ->> 'n');
            anomalie := 'piece_quantification_absente';
            detail   := format('La contrainte « %s » a disparu. Ce que cela produit : %s.',
                               v_piece ->> 'n', v_piece ->> 'e');
            return next;
        end if;
    end loop;

    -- ── 6. ⚠️ LES CONTRAINTES SONT ÉPROUVÉES, pas lues (§39.1) ─────────────────────
    --
    -- Un `check (… or true)` porte le bon nom, les bons littéraux, et n'interdit rien —
    -- c'est le constat **Q-312**, et il est passé au vert sous zéro anomalie. Le garde
    -- SOUMET donc une ligne interdite dans une transaction annulée, et exige le refus.
    --
    -- ⚠️ Et ce contrôle ne LIT aucune ligne de la table (`CONVENTIONS.md` §41) : il en
    -- écrit une, dans un point de reprise annulé. `install.sh` appelle
    -- `f_verifier_schema()` sans périmètre ; l'insertion serait refusée par la RLS avant
    -- de l'être par la contrainte, ce qui rendrait le contrôle toujours vert. D'où
    -- `f_contrainte_accepte()`, qui évalue le PRÉDICAT sur une ligne témoin sans
    -- l'insérer — le mécanisme posé par la migration `031` pour exactement ce cas.
    for v_piece in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte('risque_quantification',
                                          v_piece ->> 'n', v_piece -> 'ligne');
        if v_accepte is null then
            objet    := 'risque_quantification.' || (v_piece ->> 'n');
            anomalie := 'contrainte_non_mesurable';
            detail   := format(
                'Le prédicat de « %s » n''a pas pu être évalué sur sa ligne témoin. ⚠️ On '
                'ne prend PAS « je n''ai pas pu mesurer » pour « c''est bon » : c''est '
                'exactement le défaut que f_contrainte_accepte() a été écrite pour fermer '
                '(constat Q-292).', v_piece ->> 'n');
            return next;
        elsif v_accepte then
            objet    := 'risque_quantification.' || (v_piece ->> 'n');
            anomalie := 'contrainte_videe_de_sa_substance';
            detail   := format(
                'La contrainte « %s » ACCEPTE la ligne témoin %s, qu''elle doit refuser. '
                'Elle porte encore son nom et ses littéraux, et elle n''interdit plus '
                'rien — la forme exacte du constat **Q-312**, où « check (… or true) » '
                'passait au vert sous zéro anomalie. Ce que cela produit : %s.',
                v_piece ->> 'n', v_piece -> 'ligne', v_piece ->> 'e');
            return next;
        end if;
    end loop;

    -- ── 7. ⚠️ ET LE NON-BRUIT : UNE LIGNE VALIDE PASSE TOUTES LES CONTRAINTES ──────
    --
    -- Sans ce second sens, une contrainte devenue `check (false)` satisferait le
    -- contrôle 6 de la plus belle manière — elle refuse tout, donc elle refuse aussi le
    -- témoin — pendant que le produit deviendrait inutilisable. *Une morsure sans
    -- non-bruit ne mesure que la moitié d'une barrière*, leçon de
    -- `f_verifier_set_null_composites()` (`CONVENTIONS.md` §43).
    for v_piece in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte('risque_quantification',
                                          v_piece ->> 'n', v_ligne_valide);
        if v_accepte is distinct from true then
            objet    := 'risque_quantification.' || (v_piece ->> 'n');
            anomalie := 'contrainte_refuse_une_ligne_valide';
            detail   := format(
                'La contrainte « %s » REFUSE une quantification parfaitement ordinaire '
                '(deux événements par an, mille euros de perte primaire, deux cents de '
                'perte secondaire, hypothèses écrites). Une barrière qui refuse tout '
                'satisfait le contrôle précédent et rend le produit inutilisable : les '
                'deux sens sont nécessaires.', v_piece ->> 'n');
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_quantification_fair() is
    'Garde-fou de la quantification financière (action 25.4). Les deux dérivations sont '
    'ÉPROUVÉES sur treize cas témoins (§39.1), dont six tiennent à eux seuls le critère : '
    'un triplet incomplet ne rend RIEN, une perte secondaire absente ne vaut pas zéro '
    'mais fait un PLANCHER, et la pondération PERT est vérifiée sur le cas qui la '
    'distingue d''une moyenne arithmétique. Les quatorze pièces du schéma sont nommées '
    'UNE PAR UNE (§39.7), et les deux colonnes dérivées sont mesurées ENGENDRÉES — une '
    'colonne ordinaire du même nom serait écrivable par le navigateur, et le montant '
    'cesserait d''être celui que les hypothèses produisent. Découvert par '
    'f_decouvrir_controles_schema().';

-- =====================================================================================
-- §7 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('050', 'La quantification financière d''un risque (FAIR, action 25.4) : fréquence '
               'et magnitude estimées par TRIPLETS, perte annualisée DÉRIVÉE et nulle dès '
               'qu''une hypothèse manque, pertes secondaires facultatives qui font un '
               'PLANCHER annoncé — et le garde-fou du lot ÉLARGI, qui balayait les tables '
               'par leur NOM et laissait échapper celle-ci')
on conflict (version) do nothing;

commit;
