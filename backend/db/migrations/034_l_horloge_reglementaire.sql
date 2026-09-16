-- =====================================================================================
--  034 — L'HORLOGE RÉGLEMENTAIRE : NIS2 À TROIS PALIERS, ET LE 72 H DU RGPD
--
--  §0  Le périmètre de la migration
--  §1  L'instant de détection — une horloge de 24 h ne part pas d'une date nue
--  §2  Le calcul des paliers, à UN SEUL endroit : f_echeances_reglementaires()
--  §3  La table « declarations_reglementaires » — ce qui a été FAIT
--  §4  Cloisonnement
--  §5  Le garde-fou
--  §6  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Action **20.1** du `docs/PLAN_PRODUIT.md` : *« Le produit sait dire qu'un incident est
--  “à déclarer”. Il ne sait pas dire QUAND, ni AVEC QUOI. NIS2 impose trois paliers ; le
--  produit n'en arme aucun. »*
--
--  Les quatre échéances, et leur source :
--
--    · **alerte précoce — 24 h**      NIS2, art. 23 §4 a)
--    · **notification — 72 h**        NIS2, art. 23 §4 b)
--    · **rapport final — 1 mois**     NIS2, art. 23 §4 d)
--    · **notification CNIL — 72 h**   RGPD, art. 33
--
--  ── ⚠️ CE QUE CETTE MIGRATION A TROUVÉ, ET QUI EST UN DÉFAUT DU PRODUIT ────────────
--
--  `incidents.date_detection` est de type **`date`** : une date NUE, sans heure. Or le
--  critère d'acceptation 20.1 dit, en toutes lettres : *« le calcul part de la date de
--  détection, et l'écran dit LAQUELLE — une horloge dont on ignore l'origine ne se défend
--  pas devant l'ANSSI »*.
--
--  **Une horloge de vingt-quatre heures qui part d'une date sans heure ne se défend pas**,
--  et l'erreur peut atteindre vingt-quatre heures — c'est-à-dire la totalité du premier
--  palier. Un incident détecté le 3 à 23 h et un incident détecté le 3 à 1 h du matin
--  auraient la même échéance.
--
--  On ajoute donc `detecte_le timestamptz`, **sans toucher à `date_detection`** :
--
--    · la colonne existante entre dans le format d'échange `grc-backup` (v13) et dans la
--      reprise. La changer casserait le round-trip, que le `PLAN_SERVEUR` §2.6 protège ;
--    · la colonne neuve est **facultative**, et son absence est un fait que le produit
--      DIT : l'horloge repart alors de minuit, et la route rend
--      `origine: 'date_seule'` pour que l'écran puisse écrire « précision : la journée ».
--
--  *Une imprécision affichée vaut mieux qu'une précision inventée.*
--
--  ── L'ÉCHÉANCE EST DÉRIVÉE, JAMAIS RECOPIÉE ───────────────────────────────────────
--
--  Le critère 19.2 le dit pour les dérogations, et cela vaut ici : *« le calcul vit à un
--  seul endroit »*. On ne stocke donc **aucune** échéance : `f_echeances_reglementaires()`
--  les calcule, et la table ne retient que ce qui a été **FAIT** — la date de la
--  déclaration et la référence rendue par l'autorité.
--
--  Stocker les échéances aurait produit le défaut classique : une date de détection
--  corrigée laisserait derrière elle des échéances calculées sur l'ancienne, et personne
--  ne le saurait.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 034_l_horloge_reglementaire.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
do $$
begin
    perform set_config('grc.utilisateur', 'migration-034', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — L'INSTANT DE DÉTECTION
-- =====================================================================================

alter table incidents
    add column if not exists detecte_le timestamptz;

comment on column incidents.detecte_le is
    'INSTANT de détection (action 20.1). ⚠️ « date_detection » est une date NUE : une '
    'horloge de 24 h qui en part peut se tromper de 24 h, soit la totalité du premier '
    'palier NIS2. Cette colonne est FACULTATIVE — son absence fait repartir l''horloge de '
    'minuit, et la route le DIT (origine = « date_seule »). Une imprécision affichée vaut '
    'mieux qu''une précision inventée. « date_detection » n''est pas touchée : elle entre '
    'dans le format d''échange grc-backup, que la reprise doit rendre à l''identique.';

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values ('incidents', 'detecte_le', 'non_personnelle', null, null, null, null,
        'Horodatage de la détection d''un incident. Décrit un ÉVÉNEMENT, pas une personne.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §2 — LE CALCUL DES PALIERS, À UN SEUL ENDROIT
-- =====================================================================================
-- ⚠️ **Un seul endroit**, et c'est celui-ci. La route, l'échéancier et le banc l'appellent
-- tous les trois ; une seconde rédaction — dans une requête, dans le navigateur — se
-- mettrait à diverger au premier ajustement, et deux comptes de la même échéance
-- réglementaire est la pire chose qu'un outil produit en audit puisse afficher.
--
-- Les délais sont écrits AVEC leur source. Un chiffre réglementaire sans sa référence est
-- un chiffre que personne ne peut vérifier — et celui qui le vérifiera est un auditeur.

create or replace function f_echeances_reglementaires(
    p_detecte_le   timestamptz,
    p_date_detection date
)
returns table (
    regime     text,
    palier     text,
    reference  text,
    echeance   timestamptz,
    origine    text
)
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    with depart as (
        select coalesce(p_detecte_le, p_date_detection::timestamptz) as instant,
               case when p_detecte_le is not null then 'instant' else 'date_seule' end as origine
    )
    select v.regime, v.palier, v.reference,
           d.instant + v.delai,
           d.origine
      from depart d
      cross join (values
        ('nis2', 'alerte_precoce', 'NIS2, article 23 §4 a)',  interval '24 hours'),
        ('nis2', 'notification',   'NIS2, article 23 §4 b)',  interval '72 hours'),
        ('nis2', 'rapport_final',  'NIS2, article 23 §4 d)',  interval '1 month'),
        ('rgpd', 'notification_cnil', 'RGPD, article 33',     interval '72 hours')
      ) as v(regime, palier, reference, delai)
     where d.instant is not null;
$$;

comment on function f_echeances_reglementaires(timestamptz, date) is
    'Les quatre échéances réglementaires d''un incident, DÉRIVÉES de sa détection — jamais '
    'stockées. Trois paliers NIS2 (24 h, 72 h, 1 mois) et le 72 h du RGPD, chacun avec sa '
    'référence au texte. ⚠️ Rend aussi « origine » : « instant » quand detecte_le est '
    'renseigné, « date_seule » sinon — l''écran doit pouvoir dire la précision dont il '
    'dispose. Rend ZÉRO ligne si la détection est inconnue : une horloge sans origine ne '
    's''affiche pas, elle s''explique.';

-- =====================================================================================
-- §3 — LA TABLE « declarations_reglementaires » : CE QUI A ÉTÉ FAIT
-- =====================================================================================
-- Elle ne porte **aucune échéance** : voir l'en-tête. Elle retient le geste — quand, par
-- qui, sous quelle référence rendue par l'autorité.

create table if not exists declarations_reglementaires (
    id            id_metier   not null default f_generer_id('DECL'),
    filiale_id    id_metier   not null,
    incident_id   id_metier   not null,
    regime        text        not null,
    palier        text        not null,
    fait_le       timestamptz not null default now(),
    -- Le numéro d'accusé de réception rendu par l'ANSSI ou la CNIL. C'est LA pièce qu'un
    -- auditeur demande : « vous dites avoir déclaré — montrez-moi le récépissé ».
    reference     text,
    commentaire   text,
    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,

    constraint pk_declarations_reglementaires primary key (id),

    -- ⚠️ L'unicité porte `filiale_id` (§19.1) : sans elle, une filiale occuperait le
    -- couple (incident, palier) d'une autre, et la seconde recevrait un refus de doublon
    -- causé par une ligne qu'elle NE VOIT PAS (constat Q-2).
    constraint uq_declarations_reglementaires_palier
        unique (incident_id, regime, palier, filiale_id),

    constraint fk_declarations_reglementaires_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- Clé composite : un incident de la filiale voisine est INVISIBLE, et une clé simple
    -- serait satisfaite par lui (§17.1).
    constraint fk_declarations_reglementaires_incident
        foreign key (incident_id, filiale_id) references incidents (id, filiale_id)
        on delete cascade,

    constraint ck_declarations_reglementaires_regime
        check (regime in ('nis2', 'rgpd')),
    constraint ck_declarations_reglementaires_palier
        check (palier in ('alerte_precoce', 'notification', 'rapport_final',
                          'notification_cnil')),
    -- Un palier appartient à SON régime : « rapport_final » n'existe pas au RGPD, et
    -- « notification_cnil » n'existe pas dans NIS2. Sans cette contrainte, on pourrait
    -- déclarer un rapport final à la CNIL — et le tableau de conformité l'afficherait.
    constraint ck_declarations_reglementaires_coherence
        check ((regime = 'nis2'  and palier in ('alerte_precoce','notification','rapport_final'))
            or (regime = 'rgpd'  and palier = 'notification_cnil')),
    constraint ck_declarations_reglementaires_reference
        check (reference is null or (reference <> '' and length(reference) <= 200)),
    constraint ck_declarations_reglementaires_commentaire
        check (commentaire is null or length(commentaire) <= 2000)
);

comment on table declarations_reglementaires is
    'Ce qui a été DÉCLARÉ à une autorité, et quand (action 20.1). ⚠️ Elle ne porte aucune '
    'ÉCHÉANCE : celles-ci sont dérivées par f_echeances_reglementaires(), à un seul '
    'endroit. Stocker une échéance laisserait, après correction de la date de détection, '
    'des échéances calculées sur l''ancienne — sans que personne le sache. ⚠️ Le produit '
    'NE TRANSMET RIEN à une autorité : il prépare et il consigne, l''humain envoie.';

alter table declarations_reglementaires
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_declarations_reglementaires_provenance on declarations_reglementaires;
create trigger trg_declarations_reglementaires_provenance
    before insert on declarations_reglementaires
    for each row execute function f_marquer_provenance();
alter table declarations_reglementaires
    enable always trigger trg_declarations_reglementaires_provenance;

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('declarations_reglementaires', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('declarations_reglementaires', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('declarations_reglementaires', 'incident_id', 'non_personnelle', null, null, null, null,
   'Identifiant de l''incident déclaré.'),
  ('declarations_reglementaires', 'regime', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos ou valeur technique : nis2 ou rgpd.'),
  ('declarations_reglementaires', 'palier', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos ou valeur technique : le palier réglementaire déclaré.'),
  ('declarations_reglementaires', 'reference', 'non_personnelle', null, null, null, null,
   'Numéro d''accusé de réception rendu par l''autorité. Désigne un DOSSIER, pas une '
   'personne.'),
  ('declarations_reglementaires', 'commentaire', 'personnelle',
   'Permettre au déclarant de préciser les circonstances de la déclaration.',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom peut figurer au milieu '
   'd''une phrase — régime « signaler ».'),
  ('declarations_reglementaires', 'provenance', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos ou valeur technique : d''où vient la ligne (migration 032).')
on conflict (table_nom, colonne) do nothing;

select f_poser_tracabilite_insertion();

drop trigger if exists trg_declarations_reglementaires_maj on declarations_reglementaires;
create trigger trg_declarations_reglementaires_maj before update on declarations_reglementaires
    for each row execute function f_maj_tracabilite();
alter table declarations_reglementaires enable always trigger trg_declarations_reglementaires_maj;

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- =====================================================================================

alter table declarations_reglementaires enable row level security;
alter table declarations_reglementaires force row level security;

create policy pol_declarations_reglementaires_lecture on declarations_reglementaires
    for select using (filiale_id = any (f_filiales_lecture()));
create policy pol_declarations_reglementaires_ajout on declarations_reglementaires
    for insert with check (filiale_id = f_filiale_ecriture());
create policy pol_declarations_reglementaires_maj on declarations_reglementaires
    for update using (filiale_id = f_filiale_ecriture())
            with check (filiale_id = f_filiale_ecriture());
create policy pol_declarations_reglementaires_suppression on declarations_reglementaires
    for delete using (filiale_id = f_filiale_ecriture());

comment on policy pol_declarations_reglementaires_lecture on declarations_reglementaires is
    'Une déclaration réglementaire est TOUJOURS locale : c''est la filiale qui déclare à '
    'son autorité nationale. Elle suit donc le périmètre de lecture, sans cas « portée '
    'Groupe ».';

-- =====================================================================================
-- §5 — LE GARDE-FOU
-- =====================================================================================
-- ⚠️ Il ÉPROUVE le calcul des paliers au lieu de lire son texte — `CONVENTIONS.md` §39.1.
-- Un garde qui vérifierait que la fonction « existe » passerait au vert sur une fonction
-- qui rend les quatre paliers à la même heure, ou aucun.

create or replace function f_verifier_horloge_reglementaire()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Un instant témoin, fixe : le calcul doit être reproductible.
    v_t constant timestamptz := timestamptz '2026-03-01 09:00:00+00';
    r   record;
    v_attendus constant jsonb := jsonb_build_object(
        'nis2/alerte_precoce',    24,
        'nis2/notification',      72,
        'nis2/rapport_final',    744,   -- un mois de 31 jours à partir du 1er mars
        'rgpd/notification_cnil', 72
    );
    v_vus int := 0;
begin
    if to_regprocedure('public.f_echeances_reglementaires(timestamptz, date)') is null then
        objet    := 'f_echeances_reglementaires';
        anomalie := 'horloge_reglementaire_absente';
        detail   := 'La fonction qui calcule les paliers NIS2 et RGPD a disparu. Sans elle, '
                    'le produit ne sait plus dire QUAND une déclaration est due — et c''est '
                    'l''objet même de l''action 20.1.';
        return next;
        return;
    end if;

    for r in select * from f_echeances_reglementaires(v_t, v_t::date) loop
        v_vus := v_vus + 1;
        if (v_attendus ->> (r.regime || '/' || r.palier)) is null then
            objet    := r.regime || '/' || r.palier;
            anomalie := 'palier_reglementaire_inconnu';
            detail   := 'Ce palier n''est pas celui que la loi impose, ou son nom a changé : '
                        'le garde ne sait pas quoi en penser, et un palier que personne ne '
                        'reconnaît n''est pas un palier.';
            return next;
            continue;
        end if;
        if extract(epoch from (r.echeance - v_t)) / 3600
           <> (v_attendus ->> (r.regime || '/' || r.palier))::numeric then
            objet    := r.regime || '/' || r.palier;
            anomalie := 'delai_reglementaire_faux';
            detail   := format(
                'Le délai calculé est de %s heures ; la loi en impose %s (%s). ⚠️ Ce garde '
                'ÉPROUVE le calcul sur un instant témoin, il ne lit pas le texte de la '
                'fonction : un délai changé par mégarde est visible ici, et nulle part '
                'ailleurs.',
                round(extract(epoch from (r.echeance - v_t)) / 3600, 2),
                v_attendus ->> (r.regime || '/' || r.palier),
                r.reference);
            return next;
        end if;
    end loop;

    if v_vus <> 4 then
        objet    := 'f_echeances_reglementaires';
        anomalie := 'paliers_reglementaires_incomplets';
        detail   := format(
            'La fonction rend %s palier(s) au lieu de 4 : trois pour NIS2 (24 h, 72 h, '
            '1 mois) et un pour le RGPD (72 h). Un palier manquant est une obligation que '
            'le produit cesse d''armer, en silence.', v_vus);
        return next;
    end if;

    -- ⚠️ ET LE CAS SANS DÉTECTION : la fonction doit rendre ZÉRO ligne, jamais une
    -- échéance calculée sur du vide. Une horloge qui part de nulle part afficherait une
    -- date que personne ne peut défendre.
    if exists (select 1 from f_echeances_reglementaires(null, null)) then
        objet    := 'f_echeances_reglementaires';
        anomalie := 'horloge_sans_origine';
        detail   := 'La fonction rend des échéances alors que la détection est INCONNUE. '
                    'Une horloge sans origine ne s''affiche pas, elle s''explique.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_horloge_reglementaire() is
    'Garde-fou : les quatre paliers réglementaires existent et leurs délais sont exacts, '
    'ÉPROUVÉS sur un instant témoin — jamais lus dans le texte de la fonction '
    '(CONVENTIONS.md §39.1). Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §6 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('034', 'l''horloge réglementaire : trois paliers NIS2 (24 h, 72 h, 1 mois) et le 72 h '
               'du RGPD, DÉRIVÉS d''un instant de détection — et la table de ce qui a été '
               'réellement déclaré, avec le récépissé de l''autorité')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_horloge_reglementaire();
--   delete from controles_schema where fonction = 'f_verifier_horloge_reglementaire';
--   drop table if exists declarations_reglementaires;
--   drop function if exists f_echeances_reglementaires(timestamptz, date);
--   delete from colonnes_personnelles where table_nom = 'declarations_reglementaires';
--   alter table incidents drop column if exists detecte_le;
--   delete from colonnes_personnelles where table_nom='incidents' and colonne='detecte_le';
--   delete from migrations_schema where version = '034';
--   commit;
--   -- ⚠️ Annuler DÉTRUIT la trace des déclarations faites aux autorités, récépissés
--   --    compris. C'est la pièce qu'un auditeur demande en premier : exportez-la avant.
-- =====================================================================================
