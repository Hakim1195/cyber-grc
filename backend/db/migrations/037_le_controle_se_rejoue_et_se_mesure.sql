-- =====================================================================================
--  037 — UN CONTRÔLE SE REJOUE, ET SON EFFICACITÉ N'EST PAS SA MATURITÉ
--
--  §0  Le périmètre de la migration
--  §1  L'efficacité, distincte de la maturité (action 19.6)
--  §2  Le contrôle périodique : fréquence, dernier passage (action 19.5)
--  §3  La prochaine échéance est DÉRIVÉE, à un seul endroit
--  §4  Le garde-fou
--  §5  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Deux actions du `docs/PLAN_PRODUIT.md`, portées ensemble parce qu'elles vivent sur la
--  même table et répondent à la même objection d'auditeur.
--
--  **19.6 — « efficacité distincte de la maturité — deux dimensions, deux colonnes »**.
--  **19.5 — « contrôles périodiques sur les mesures : fréquence, prochaine échéance,
--  preuve d'exécution, relance par L12 ». Le modèle de `mco_actions` est RÉUTILISÉ, pas
--  recopié.**
--
--  ── LA DISTINCTION QUE LE PRODUIT NE SAVAIT PAS FAIRE ──────────────────────────────
--
--  `mesure_mise_en_oeuvre.maturite` porte une échelle CMMI : *à quel point ce contrôle
--  est-il institutionnalisé ?* — de « fait au coup par coup » à « mesuré et optimisé ».
--  C'est une question de **procédé**.
--
--  Elle ne dit rien de la seule chose qu'un auditeur cherche : *est-ce que ça marche ?*
--  Une sauvegarde peut être documentée, planifiée, supervisée — maturité 4 — et ne pas
--  se restaurer. Un contrôle d'accès peut être improvisé — maturité 1 — et ne laisser
--  passer personne.
--
--  ⚠️ **Confondre les deux, c'est le défaut classique des tableaux de bord GRC** : on y
--  lit une moyenne de maturité en croyant lire un niveau de protection. Les deux colonnes
--  existent donc séparément, et **la moyenne CMMI du tableau de bord n'est PAS touchée** —
--  le critère 19.6 le demande en toutes lettres, et pour une bonne raison : un indicateur
--  dont la définition change en silence fait mentir tout son historique.
--
--  ── ET UN CONTRÔLE QUI NE SE REJOUE PAS N'EST PAS UN CONTRÔLE ──────────────────────
--
--  Une évaluation vaut au jour où elle est faite. Sans fréquence ni date de dernier
--  passage, le produit affichait un statut de 2024 exactement comme un statut d'hier —
--  et rien ne distinguait *« vérifié le mois dernier »* de *« jamais revérifié depuis
--  qu'on l'a coché »*.
--
--  ⚠️ **La prochaine échéance est DÉRIVÉE, jamais stockée**, pour le motif exact de
--  l'action 19.2 : une date stockée demande que quelque chose la recalcule, et le jour
--  où ce quelque chose ne tourne pas, le produit annonce une échéance qui n'est plus la
--  bonne — en silence. `f_prochain_controle()` est le seul endroit où le calcul existe.
--
-- =====================================================================================
-- Invocation :
--   psql -v ON_ERROR_STOP=1 -d cyber_grc -f 037_le_controle_se_rejoue_et_se_mesure.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Les §1 et §2 posent des contraintes qui VALIDENT les lignes existantes, et
-- `force row level security` vaut pour le propriétaire. Motif du §0 de la `012`.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-037', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — L'EFFICACITÉ, DISTINCTE DE LA MATURITÉ (action 19.6)
-- =====================================================================================
-- ⚠️ **Trois valeurs, et pas une échelle de 0 à 5.** La maturité en porte une, et lui en
-- donner une seconde du même format inviterait à les moyenner ensemble — c'est-à-dire à
-- refaire le mélange que cette colonne existe pour défaire. « Efficace / partiellement /
-- inefficace » se constate ; un niveau de 0 à 5 s'estime.
--
-- ⚠️ Et elle est NULLABLE, sans défaut : *« non constatée »* n'est pas *« inefficace »*.
-- Poser un défaut ferait apparaître, le jour de la migration, des centaines de contrôles
-- réputés inefficaces que personne n'a examinés. *Un produit qui fabrique des alertes le
-- jour de sa mise à jour apprend à ce qu'on ignore ses alertes.*

alter table mesure_mise_en_oeuvre
    add column if not exists efficacite text,
    add column if not exists efficacite_constatee_le date,
    add column if not exists efficacite_preuve text;

alter table mesure_mise_en_oeuvre drop constraint if exists ck_mesure_mise_en_oeuvre_efficacite;
alter table mesure_mise_en_oeuvre add constraint ck_mesure_mise_en_oeuvre_efficacite
    check (efficacite is null or efficacite in ('efficace', 'partiellement', 'inefficace'));

-- La date et la constatation sont indissociables dans un seul sens : on peut constater
-- sans dater (une reprise d'historique), mais une date sans constatation ne veut rien
-- dire. L'implication, et non l'équivalence, dit exactement cela.
alter table mesure_mise_en_oeuvre drop constraint if exists ck_mesure_mise_en_oeuvre_eff_date;
alter table mesure_mise_en_oeuvre add constraint ck_mesure_mise_en_oeuvre_eff_date
    check (efficacite_constatee_le is null or efficacite is not null);

alter table mesure_mise_en_oeuvre drop constraint if exists ck_mesure_mise_en_oeuvre_eff_preuve;
alter table mesure_mise_en_oeuvre add constraint ck_mesure_mise_en_oeuvre_eff_preuve
    check (efficacite_preuve is null or length(efficacite_preuve) <= 2000);

comment on column mesure_mise_en_oeuvre.efficacite is
    'EST-CE QUE ÇA MARCHE (action 19.6) — à ne pas confondre avec « maturite », qui dit à '
    'quel point le contrôle est institutionnalisé. Une sauvegarde peut être documentée, '
    'planifiée et supervisée (maturité 4) et ne pas se restaurer. ⚠️ Trois valeurs et non '
    'une échelle de 0 à 5 : un second barème du même format inviterait à moyenner les deux '
    'ensemble, c''est-à-dire à refaire le mélange que cette colonne défait. NULLABLE : '
    '« non constatée » n''est pas « inefficace ».';

comment on column mesure_mise_en_oeuvre.efficacite_preuve is
    'Ce sur quoi la constatation s''appuie — un test de restauration, un relevé, un '
    'rapport. ⚠️ Du TEXTE, pas une pièce jointe : le fichier, lui, s''attache au document '
    'qui prouve le contrôle (action 19.3). Deux endroits pour un fichier en feraient deux '
    'vérités.';

-- =====================================================================================
-- §2 — LE CONTRÔLE PÉRIODIQUE (action 19.5)
-- =====================================================================================
-- ⚠️ **Le vocabulaire des fréquences est celui de `mco_actions`, À L'IDENTIQUE** — le
-- critère 19.5 dit « le modèle de `mco_actions` est RÉUTILISÉ, pas recopié ». On ne le
-- recopie donc pas de mémoire : on le LIT dans la contrainte appliquée, et l'on refuse
-- d'agir si elle a changé. Deux vocabulaires qui divergeraient donneraient deux listes
-- déroulantes différentes pour la même question.

alter table mesure_mise_en_oeuvre
    add column if not exists frequence_controle text,
    add column if not exists dernier_controle date;

alter table mesure_mise_en_oeuvre drop constraint if exists ck_mesure_mise_en_oeuvre_frequence;

do $$
declare
    v_predicat text;
    v_valeurs  text;
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'mco_actions' and c.conname = 'ck_mco_actions_frequence';

    if v_predicat is null then
        raise exception 'ck_mco_actions_frequence est introuvable : le vocabulaire des '
                        'fréquences n''existe pas là où cette migration le lit.';
    end if;

    -- ⚠️ **PostgreSQL NORMALISE `in (…)` en `= ANY (ARRAY[…])`**, et la première
    -- rédaction cherchait la forme telle qu'elle est ÉCRITE dans la migration `003` —
    -- pas telle qu'elle est APPLIQUÉE. Le garde a refusé, et il a eu raison : c'est
    -- exactement son office, et c'est la leçon du §4 de la `027` reprise une fois de
    -- plus. *On lit ce que la base porte, jamais ce qu'on se souvient d'avoir écrit.*
    v_valeurs := substring(v_predicat from 'ARRAY\[(.*)\]');
    if v_valeurs is null or position('''Trimestrielle''' in v_valeurs) = 0 then
        raise exception 'Le vocabulaire des fréquences de mco_actions n''a pas la forme '
                        'attendue (%). La reprise à l''aveugle est refusée plutôt '
                        'qu''appliquée de travers.', v_predicat;
    end if;

    -- Les valeurs portent leur transtypage explicite (« 'Annuelle'::text »), écrit par
    -- PostgreSQL lui-même : on les emploie telles quelles plutôt que de les nettoyer,
    -- puisque tout nettoyage serait une interprétation de plus.
    execute format(
        'alter table mesure_mise_en_oeuvre add constraint ck_mesure_mise_en_oeuvre_frequence '
        'check (frequence_controle is null or frequence_controle = any (array[%s]))', v_valeurs);
    raise notice 'Fréquences de contrôle reprises de mco_actions : %', v_valeurs;
end;
$$;

comment on column mesure_mise_en_oeuvre.frequence_controle is
    'À quel rythme ce contrôle se rejoue. ⚠️ Le vocabulaire est celui de mco_actions, LU '
    'dans sa contrainte appliquée et non recopié de mémoire (action 19.5). Nul = le '
    'contrôle ne se rejoue pas à échéance fixe, ce qui est un choix, pas un oubli.';

comment on column mesure_mise_en_oeuvre.dernier_controle is
    'Quand ce contrôle a été rejoué pour la dernière fois. ⚠️ Sans cette date, un statut '
    'de 2024 s''affiche exactement comme un statut d''hier, et rien ne distingue '
    '« vérifié le mois dernier » de « jamais revérifié depuis qu''on l''a coché ».';

-- Le registre de l'article 30 réclame une décision pour chaque colonne (constat Q-295).
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('mesure_mise_en_oeuvre', 'efficacite', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (efficace / partiellement / inefficace) : un verdict sur un contrôle, '
   'pas sur une personne.'),
  ('mesure_mise_en_oeuvre', 'efficacite_constatee_le', 'non_personnelle', null, null, null, null,
   'Date de constatation : une date de gestion, elle ne désigne personne.'),
  ('mesure_mise_en_oeuvre', 'efficacite_preuve', 'personnelle',
   'Dire sur quoi la constatation d''efficacité s''appuie — un test, un relevé, un rapport.',
   'Intérêt légitime',
   1095,
   'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom peut figurer au milieu '
   'd''une phrase (« test mené par X »). Le remplacer détruirait la phrase, et cette '
   'phrase est une preuve — d''où « signaler » plutôt qu''« anonymiser ».'),
  ('mesure_mise_en_oeuvre', 'frequence_controle', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos repris de mco_actions : un rythme, pas une personne.'),
  ('mesure_mise_en_oeuvre', 'dernier_controle', 'non_personnelle', null, null, null, null,
   'Date du dernier passage : une date de gestion, elle ne désigne personne.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §3 — LA PROCHAINE ÉCHÉANCE EST DÉRIVÉE, À UN SEUL ENDROIT
-- =====================================================================================
-- ⚠️ **Elle n'est PAS une colonne**, et c'est le motif de l'action 19.2 repris ici : une
-- date stockée demande que quelque chose la recalcule quand la fréquence change ou quand
-- un contrôle est rejoué. Le jour où ce quelque chose ne tourne pas, le produit annonce
-- une échéance qui n'est plus la bonne — **en silence**, dans un outil produit en audit.
--
-- `immutable` : elle ne lit ni l'horloge ni la base. C'est ce qui permet de l'employer
-- dans une requête, dans un index, et de la tester sans monter de décor.

create or replace function f_prochain_controle(
    p_dernier    date,
    p_frequence  text
)
returns date
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        -- Sans dernier passage, il n'y a pas d'échéance à calculer : le contrôle n'a
        -- jamais été joué, et prétendre le contraire en partant d'aujourd'hui inventerait
        -- une date que personne ne peut défendre.
        when p_dernier is null then null
        when p_frequence = 'Hebdomadaire'  then p_dernier + interval '7 days'
        when p_frequence = 'Mensuelle'     then p_dernier + interval '1 month'
        when p_frequence = 'Trimestrielle' then p_dernier + interval '3 months'
        when p_frequence = 'Semestrielle'  then p_dernier + interval '6 months'
        when p_frequence = 'Annuelle'      then p_dernier + interval '1 year'
        -- « Ponctuelle » et l'absence de fréquence rendent NULL : un contrôle qui ne se
        -- rejoue pas à échéance fixe n'en a pas, et zéro n'est pas une réponse.
        else null
    end::date;
$$;

comment on function f_prochain_controle(date, text) is
    'La prochaine échéance d''un contrôle périodique, DÉRIVÉE du dernier passage et de la '
    'fréquence — jamais stockée (action 19.5). Seul endroit du produit où ce calcul '
    'existe. Rend NULL quand le contrôle n''a jamais été joué ou ne se rejoue pas à '
    'échéance fixe : zéro n''est pas une réponse, et une date inventée ne se défend pas.';

-- =====================================================================================
-- §4 — LE GARDE-FOU
-- =====================================================================================
-- ⚠️ Il ÉPROUVE le calcul sur des valeurs témoins au lieu de lire le texte de la fonction
-- (`CONVENTIONS.md` §39.1), et il nomme ses pièces une par une (§39.7). Un garde qui se
-- contenterait de vérifier que `f_prochain_controle` « existe » passerait au vert sur une
-- version qui rend toujours la même date.

create or replace function f_verifier_controle_periodique()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_base constant date := date '2026-01-15';
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('freq','Hebdomadaire',  'attendu','2026-01-22'),
        jsonb_build_object('freq','Mensuelle',     'attendu','2026-02-15'),
        jsonb_build_object('freq','Trimestrielle', 'attendu','2026-04-15'),
        jsonb_build_object('freq','Semestrielle',  'attendu','2026-07-15'),
        jsonb_build_object('freq','Annuelle',      'attendu','2027-01-15')
    );
    v_cas_un jsonb;
    v_rendu  date;
    v_piece  jsonb;
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('nom','ck_mesure_mise_en_oeuvre_efficacite',
            'effet','le vocabulaire de l''efficacité n''est plus fermé : « bof » entre, et '
                   'l''indicateur cesse d''être agrégeable'),
        jsonb_build_object('nom','ck_mesure_mise_en_oeuvre_frequence',
            'effet','le vocabulaire des fréquences n''est plus fermé, et il cesse d''être '
                   'celui de mco_actions — deux listes déroulantes pour une même question'),
        jsonb_build_object('nom','ck_mesure_mise_en_oeuvre_eff_date',
            'effet','une date de constatation sans constatation devient possible : elle ne '
                   'veut rien dire, et elle se lit pourtant comme une preuve')
    );
begin
    if to_regprocedure('public.f_prochain_controle(date, text)') is null then
        objet    := 'f_prochain_controle';
        anomalie := 'echeance_controle_absente';
        detail   := 'La fonction qui dit QUAND un contrôle doit être rejoué a disparu. '
                    'Sans elle, un statut de 2024 s''affiche comme un statut d''hier.';
        return next;
        return;
    end if;

    -- ── La dérivation est ÉPROUVÉE, pas lue ────────────────────────────────────────
    for v_cas_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := f_prochain_controle(v_base, v_cas_un ->> 'freq');
        if v_rendu is distinct from (v_cas_un ->> 'attendu')::date then
            objet    := 'f_prochain_controle';
            anomalie := 'echeance_controle_fausse';
            detail   := format(
                'Dernier passage le %s, fréquence « %s » : la fonction rend %s au lieu de '
                '%s. ⚠️ Ce garde ÉPROUVE le calcul sur des valeurs témoins — il ne lit pas '
                'le texte de la fonction (§39.1) : un rythme changé par mégarde est visible '
                'ici, et nulle part ailleurs.',
                v_base, v_cas_un ->> 'freq', coalesce(v_rendu::text, '(null)'),
                v_cas_un ->> 'attendu');
            return next;
        end if;
    end loop;

    -- ── Les deux cas qui doivent rendre NULL ───────────────────────────────────────
    --
    -- ⚠️ La moitié qu'on oublie : sans elle, une fonction qui rendrait « aujourd'hui »
    -- pour tout serait vue fausse sur les cinq rythmes, mais une fonction qui inventerait
    -- une échéance pour un contrôle JAMAIS JOUÉ passerait au vert.
    if f_prochain_controle(null, 'Annuelle') is not null then
        objet    := 'f_prochain_controle';
        anomalie := 'echeance_sans_passage';
        detail   := 'La fonction rend une échéance alors que le contrôle n''a JAMAIS été '
                    'joué. Une date calculée sur du vide ne se défend pas — c''est le même '
                    'motif que l''horloge réglementaire sans origine (migration 034).';
        return next;
    end if;
    if f_prochain_controle(v_base, 'Ponctuelle') is not null then
        objet    := 'f_prochain_controle';
        anomalie := 'echeance_sur_ponctuelle';
        detail   := 'La fonction rend une échéance pour un contrôle PONCTUEL, qui par '
                    'définition ne se rejoue pas. Le produit réclamerait indéfiniment un '
                    'passage que personne ne doit faire.';
        return next;
    end if;

    -- ── Les pièces nommées ─────────────────────────────────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.mesure_mise_en_oeuvre')
               and c.conname = v_piece ->> 'nom'
               and c.convalidated)
        then
            objet    := 'mesure_mise_en_oeuvre.' || (v_piece ->> 'nom');
            anomalie := 'controle_periodique_piece_manquante';
            detail   := format(
                'Cette pièce des actions 19.5 / 19.6 a disparu ou n''est pas validée. Ce '
                'que sa disparition rouvre : %s.', v_piece ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── ET L'EFFICACITÉ RESTE DISTINCTE DE LA MATURITÉ ─────────────────────────────
    --
    -- ⚠️ Mesuré sur le TYPE, pas sur une intention : le jour où quelqu'un ramènera
    -- l'efficacité à un entier de 0 à 5, plus rien n'empêchera de la moyenner avec la
    -- maturité — et le tableau de bord affichera un chiffre qui mélange « à quel point
    -- c'est institutionnalisé » et « est-ce que ça marche ». C'est le défaut classique
    -- des tableaux de bord GRC, et l'action 19.6 existe pour l'éviter.
    if exists (
        select 1 from pg_attribute a
         where a.attrelid = to_regclass('public.mesure_mise_en_oeuvre')
           and a.attname = 'efficacite'
           and a.attnum > 0 and not a.attisdropped
           and format_type(a.atttypid, null) not in ('text', 'character varying'))
    then
        objet    := 'mesure_mise_en_oeuvre.efficacite';
        anomalie := 'efficacite_redevenue_un_barème';
        detail   := 'L''efficacité n''est plus un vocabulaire mais un nombre : rien '
                    'n''empêche plus de la moyenner avec la maturité, et le tableau de '
                    'bord mélangerait « à quel point c''est institutionnalisé » avec '
                    '« est-ce que ça marche ». Les deux dimensions sont distinctes, et '
                    'c''est tout l''objet de l''action 19.6.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_controle_periodique() is
    'Garde-fou des actions 19.5 et 19.6 : les cinq rythmes sont ÉPROUVÉS sur une date '
    'témoin (§39.1), les deux cas « rend NULL » aussi, les trois contraintes sont nommées '
    'une par une (§39.7), et l''efficacité est mesurée SUR SON TYPE — un entier la rendrait '
    'moyennable avec la maturité. Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §5 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('037', 'un contrôle se rejoue (fréquence, dernier passage, échéance DÉRIVÉE) et son '
               'efficacité se constate séparément de sa maturité — une sauvegarde peut être '
               'documentée, planifiée, supervisée, et ne pas se restaurer')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_controle_periodique();
--   delete from controles_schema where fonction = 'f_verifier_controle_periodique';
--   drop function if exists f_prochain_controle(date, text);
--   alter table mesure_mise_en_oeuvre
--       drop constraint if exists ck_mesure_mise_en_oeuvre_efficacite,
--       drop constraint if exists ck_mesure_mise_en_oeuvre_eff_date,
--       drop constraint if exists ck_mesure_mise_en_oeuvre_eff_preuve,
--       drop constraint if exists ck_mesure_mise_en_oeuvre_frequence,
--       drop column if exists efficacite,
--       drop column if exists efficacite_constatee_le,
--       drop column if exists efficacite_preuve,
--       drop column if exists frequence_controle,
--       drop column if exists dernier_controle;
--   delete from colonnes_personnelles
--    where table_nom = 'mesure_mise_en_oeuvre'
--      and colonne in ('efficacite','efficacite_constatee_le','efficacite_preuve',
--                      'frequence_controle','dernier_controle');
--   delete from migrations_schema where version = '037';
--   commit;
--   -- ⚠️ Annuler DÉTRUIT la trace des constatations d'efficacité et des passages de
--   --    contrôle. C'est ce qu'un auditeur demande après « montrez-moi la procédure ».
-- =====================================================================================
