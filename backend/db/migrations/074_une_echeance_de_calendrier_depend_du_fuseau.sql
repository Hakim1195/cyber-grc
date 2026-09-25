-- =====================================================================================
--  074 — UNE ÉCHÉANCE DE CALENDRIER DÉPEND DU FUSEAU, ET « IMMUTABLE » LE NIAIT
--
--  §1  `f_echeances_reglementaires` cesse de se déclarer IMMUTABLE
--  §2  `f_echeance_contractuelle` aussi — le même cast, trouvé par balayage
--  §3  Le garde de l'horloge : un verdict qui ne dépend plus de qui l'interroge
--  §4  Un garde de CLASSE : aucune fonction IMMUTABLE ne lit le fuseau de session
--  §5  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  🛑 **UNE INSTALLATION NEUVE A ÉCHOUÉ CHEZ LE CLIENT**, à la migration `038`, sur un
--  garde-fou du schéma :
--
--      nis2/rapport_final : delai_reglementaire_faux
--      (Le délai calculé est de 743.00 heures ; la loi en impose 744.)
--
--  Et ce défaut **n'est pas dans le produit** : il est dans la façon dont le garde
--  MESURE le produit.
--
--  ── LE MÉCANISME, MESURÉ ────────────────────────────────────────────────────────
--
--  `f_echeances_reglementaires` calcule le rapport final NIS2 par
--  `instant + interval '1 month'`. Sur un `timestamptz`, PostgreSQL fait cette addition
--  **en temps civil** : il convertit dans le fuseau de la SESSION, ajoute un mois de
--  calendrier au cadran, puis reconvertit. Le nombre d'heures réellement écoulées dépend
--  donc des changements d'heure traversés.
--
--  Mesuré sur la base de la recette, SANS RIEN CHANGER AU SCHÉMA — seul `TimeZone` varie :
--
--      Etc/UTC           → 744 h   0 anomalie
--      Europe/Paris      → 743 h   1 anomalie  (heure d'été le 29/03/2026)
--      America/New_York  → 743 h   1 anomalie  (heure d'été le 08/03/2026)
--      Asia/Kolkata      → 744 h   0 anomalie  (pas d'heure d'été)
--      Australia/Sydney  → 744 h   0 anomalie  (bascule le 05/04, hors fenêtre)
--
--  ⚠️ **743 heures est la BONNE réponse à Paris.** « Un mois » au sens de l'article 23
--  §4 d) est un mois de calendrier en temps civil : un incident détecté le 1ᵉʳ mars à
--  10 h 00 a son rapport dû le 1ᵉʳ avril à 10 h 00, et il s'est écoulé 743 heures parce
--  que la nuit du 29 mars en a perdu une. Le produit avait raison ; **le garde exigeait
--  un nombre d'HEURES pour une grandeur de CALENDRIER**, et un nombre d'heures ne peut
--  pas être juste dans tous les fuseaux à la fois.
--
--  ── POURQUOI PERSONNE NE L'AVAIT VU ─────────────────────────────────────────────
--
--  `SRV-Infra` est en `Etc/UTC`. Le banc y est vert depuis le 16/09, et il l'est encore
--  ce soir. La VM du client est en temps civil européen. C'est **le huitième corollaire
--  du `CLAUDE.md` §8** — *une dépendance d'environnement non déclarée manquera chez
--  quelqu'un d'autre* —, et c'est la deuxième fois : une famille entière d'essais avait
--  tenu à une entrée `/etc/hosts` que rien ne posait, verte chez son auteur et 614 sur
--  628 sur une machine neuve.
--
--  🛑 **Un garde-fou dont le verdict dépend du fuseau de celui qui l'interroge n'est pas
--  un garde-fou : c'est un tirage au sort.** Et il tombe du mauvais côté au pire moment —
--  pas au banc, pas en recette, mais à la PREMIÈRE INSTALLATION CHEZ LE CLIENT, où il
--  refuse la migration et laisse la base dans son état antérieur.
--
--  ── ET UNE DÉCLARATION FAUSSE, TROUVÉE EN CHERCHANT LA PREMIÈRE ─────────────────
--
--  Les deux fonctions d'horloge se déclarent **IMMUTABLE** alors que leur résultat dépend
--  du réglage `TimeZone`. C'est une promesse fausse faite au planificateur : il s'autorise
--  à replier l'expression à la planification et à **réemployer le plan en cache** dans une
--  session dont le fuseau diffère. Aucun index ni colonne engendrée ne les appelle
--  aujourd'hui — vérifié dans le catalogue, et c'est pour cela qu'aucune donnée stockée
--  n'est fausse —, mais la promesse est à retirer avant que quelqu'un s'y fie.
--
--  ⚠️ **`f_echeance_contractuelle` (migration `071`) est dans le même cas, et aucun garde
--  ne pouvait le dire** : son arithmétique est en heures exactes, donc juste dans tous les
--  fuseaux. C'est le cast `p_date_detection::timestamptz` qui lit le fuseau — minuit
--  **local**, et c'est bien ce qu'il faut. Elle a été trouvée par un BALAYAGE DU
--  CATALOGUE, pas par un symptôme.
--
--  ⚠️ **Et trois fonctions voisines sont INNOCENTES**, ce qui donne le discriminant :
--  `f_echeance_droits` et `f_prochain_controle` ajoutent des mois à une **`date`** —
--  l'arithmétique de `date` est purement calendaire, aucun fuseau n'y entre ;
--  `f_main_courante_charge_utile` emploie `at time zone 'UTC'`, une zone **littérale**.
--  *Ce qui rend une fonction dépendante du fuseau n'est pas qu'elle parle de temps, c'est
--  qu'elle laisse la SESSION choisir.*
--
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — L'HORLOGE RÉGLEMENTAIRE CESSE DE SE DÉCLARER IMMUTABLE
-- =====================================================================================
-- ⚠️ **Le corps ne change pas d'un caractère.** `interval '1 month'` est le bon calcul :
-- un mois de calendrier en temps civil, ce que le texte impose. Seule la déclaration de
-- volatilité est corrigée — `stable` : même résultat dans une même transaction et un même
-- fuseau, ce qui est exactement ce que la fonction garantit.

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
    stable
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
    's''affiche pas, elle s''explique. '
    '⚠️ STABLE ET NON IMMUTABLE (migration 074) : « un mois » est un mois de CALENDRIER en '
    'temps civil, donc son résultat dépend du réglage TimeZone de la session — 744 heures '
    'en UTC, 743 à Paris, où la nuit du 29 mars 2026 en perd une. Les deux réponses sont '
    'justes ; c''est le nombre d''HEURES qui n''est pas une propriété du calcul. Ne PAS '
    '« réparer » en écrivant interval ''744 hours'' : février en compte 672 et mai 744, et '
    'le texte parle de mois. '
    '⚠️ ARBITRAGE OUVERT, à trancher avec le client : le fuseau employé est celui de la '
    'session, donc celui du serveur. Pour un groupe dont des filiales déclarent à une '
    'autorité d''un autre fuseau, l''heure au cadran de l''échéance se décale de l''écart '
    'saisonnier — au plus une heure sur un mois. Le porter par filiale est une '
    'FONCTIONNALITÉ (une colonne de zone civile), pas un correctif, et elle n''est pas '
    'livrée ici.';

-- =====================================================================================
-- §2 — L'ÉCHÉANCE CONTRACTUELLE : MÊME DÉCLARATION FAUSSE, TROUVÉE PAR BALAYAGE
-- =====================================================================================
-- Son arithmétique est en heures exactes — juste dans tous les fuseaux. C'est
-- `p_date_detection::timestamptz` qui lit `TimeZone` : minuit LOCAL, ce qu'il faut. Le
-- corps ne change pas ; la déclaration, si.

create or replace function f_echeance_contractuelle(
    p_detecte_le     timestamptz,
    p_date_detection date,
    p_delai_heures   integer
)
returns table (
    regime     text,
    palier     text,
    reference  text,
    echeance   timestamptz,
    origine    text
)
    language sql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
    with depart as (
        select coalesce(p_detecte_le, p_date_detection::timestamptz) as instant,
               case when p_detecte_le is not null then 'instant' else 'date_seule' end as origine
    )
    select 'contractuel',
           'notification_client',
           'Contrat de sous-traitance — RGPD, article 33 §2',
           d.instant + make_interval(hours => p_delai_heures),
           d.origine
      from depart d
     where d.instant is not null
       and p_delai_heures is not null;
$$;

comment on function f_echeance_contractuelle(timestamptz, date, integer) is
    'L''échéance de notification d''un incident au donneur d''ordre, DÉRIVÉE de la '
    'détection et du délai inscrit au contrat (RGPD article 33 §2 : le sous-traitant '
    'notifie le responsable « dans les meilleurs délais », et le contrat chiffre ce '
    'délai). Rend ZÉRO ligne sans détection ou sans délai — une échéance sans origine ne '
    's''affiche pas. '
    '⚠️ STABLE ET NON IMMUTABLE (migration 074) : le délai est en heures exactes, donc '
    'insensible au fuseau, mais `p_date_detection::timestamptz` prend MINUIT LOCAL et lit '
    'donc TimeZone. Trouvée par un balayage du catalogue, jamais par un symptôme : une '
    'déclaration fausse ne se plaint pas.';

-- =====================================================================================
-- §3 — LE GARDE DE L'HORLOGE : UN VERDICT QUI NE DÉPEND PLUS DE QUI L'INTERROGE
-- =====================================================================================
-- Deux corrections, et la seconde est la plus utile.
--
--  (a) **Le garde fixe SON fuseau** (`set timezone = 'UTC'` au niveau de la fonction).
--      Un contrôle de schéma doit rendre le même verdict sur la machine de son auteur et
--      sur la VM du client, sinon il ne mesure pas le produit : il mesure l'endroit d'où
--      on le regarde.
--
--  (b) **Il cesse d'attendre des HEURES et attend des INSTANTS**, sur DEUX mois témoins
--      de longueurs différentes — février (28 j) et mars (31 j). C'est ce qui le rend
--      plus fort qu'avant : aucune constante horaire ne satisfait les deux à la fois,
--      donc `interval '1 month'` remplacé par `interval '744 hours'` — la « réparation »
--      qui vient à l'esprit devant ce constat — le fait rougir sur février. L'ancienne
--      rédaction, elle, l'aurait accepté.
--
-- ⚠️ Ce qu'on ne fait PAS : changer le fuseau en cours de route pour éprouver le calcul
-- « à Paris ». Les gardes sont appelés dans UN SEUL `select` par `f_verifier_schema()` ;
-- y bouger `TimeZone` rendrait le verdict des AUTRES gardes dépendant de l'ordre
-- d'exécution. On guérirait la maladie en la propageant. La propriété « un mois de
-- calendrier, pas un nombre d'heures » est éprouvée par les deux témoins, sans toucher
-- au réglage.

create or replace function f_verifier_horloge_reglementaire()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp
    set timezone = 'UTC' as
$$
declare
    -- Deux instants témoins, fixes, dans des mois de LONGUEURS DIFFÉRENTES. L'attendu est
    -- un INSTANT, pas une durée : c'est la seule forme qui soit vraie dans tout fuseau.
    v_t1 constant timestamptz := timestamptz '2026-03-01 09:00:00+00';  -- mars : 31 jours
    v_t2 constant timestamptz := timestamptz '2026-02-01 09:00:00+00';  -- février : 28 jours
    r   record;
    v_attendus constant jsonb := jsonb_build_object(
        '2026-03-01 09:00:00', jsonb_build_object(
            'nis2/alerte_precoce',    '2026-03-02 09:00:00+00',
            'nis2/notification',      '2026-03-04 09:00:00+00',
            'nis2/rapport_final',     '2026-04-01 09:00:00+00',
            'rgpd/notification_cnil', '2026-03-04 09:00:00+00'),
        '2026-02-01 09:00:00', jsonb_build_object(
            'nis2/alerte_precoce',    '2026-02-02 09:00:00+00',
            'nis2/notification',      '2026-02-04 09:00:00+00',
            'nis2/rapport_final',     '2026-03-01 09:00:00+00',
            'rgpd/notification_cnil', '2026-02-04 09:00:00+00')
    );
    v_temoin   timestamptz;
    v_attendu  text;
    v_vus int;
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

    foreach v_temoin in array array[v_t1, v_t2] loop
        v_vus := 0;
        for r in select * from f_echeances_reglementaires(v_temoin, v_temoin::date) loop
            v_vus := v_vus + 1;
            v_attendu := v_attendus
                -- ⚠️ La clé est rendue en UTC EXPLICITE, jamais dans le fuseau ambiant.
                -- Le garde épingle déjà le sien, mais si quelqu'un retire cet épinglage la
                -- recherche échouerait et le garde dirait « palier inconnu » — un message
                -- qui envoie chercher un défaut de vocabulaire là où il y a un défaut de
                -- CALCUL. Mesuré : c'est ce que faisait la première rédaction.
                #>> array[to_char(v_temoin at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
                          r.regime || '/' || r.palier];
            if v_attendu is null then
                objet    := r.regime || '/' || r.palier;
                anomalie := 'palier_reglementaire_inconnu';
                detail   := 'Ce palier n''est pas celui que la loi impose, ou son nom a changé : '
                            'le garde ne sait pas quoi en penser, et un palier que personne ne '
                            'reconnaît n''est pas un palier.';
                return next;
                continue;
            end if;
            if r.echeance <> v_attendu::timestamptz then
                objet    := r.regime || '/' || r.palier;
                anomalie := 'echeance_reglementaire_fausse';
                detail   := format(
                    'Détection le %s : l''échéance calculée est %s, la loi impose %s (%s). '
                    '⚠️ Ce garde ÉPROUVE le calcul sur DEUX mois témoins de longueurs '
                    'différentes (février 28 j, mars 31 j) et compare des INSTANTS, jamais un '
                    'nombre d''heures — un nombre d''heures serait faux dès qu''un changement '
                    'd''heure tombe dans la fenêtre, et c''est ce qui a refusé une '
                    'installation le 25/09/2026 (migration 074). Aucune constante horaire ne '
                    'peut satisfaire les deux témoins : une « réparation » par '
                    'interval ''744 hours'' rougit ici.',
                    to_char(v_temoin, 'YYYY-MM-DD HH24:MI:SS TZ'),
                    to_char(r.echeance, 'YYYY-MM-DD HH24:MI:SS TZ'),
                    v_attendu, r.reference);
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
    end loop;

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
    'Garde-fou : les quatre paliers réglementaires existent et tombent sur les bons '
    'INSTANTS, ÉPROUVÉS sur deux mois témoins de longueurs différentes — jamais lus dans le '
    'texte de la fonction (CONVENTIONS.md §39.1). '
    '⚠️ Il FIXE son propre fuseau (set timezone = ''UTC'') : sa rédaction d''origine '
    'attendait 744 heures, ce qui est vrai en UTC et FAUX à Paris, où la nuit du 29 mars '
    '2026 en retire une. Elle a refusé une première installation chez un client le '
    '25/09/2026 pendant que le banc était vert sur une machine en UTC. *Un garde dont le '
    'verdict dépend du fuseau de celui qui l''interroge ne mesure pas le produit : il '
    'mesure l''endroit d''où on le regarde.* Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §4 — UN GARDE DE CLASSE : AUCUNE FONCTION IMMUTABLE NE LIT LE FUSEAU DE SESSION
-- =====================================================================================
-- ⚠️ **Le §3 ferme l'instance ; celui-ci ferme la classe** — et c'est le travers le plus
-- répétitif de ce chantier (`CONVENTIONS.md` §39, payé cinq fois). Sans lui, la prochaine
-- fonction d'échéance se déclarera `immutable` par mimétisme, et rien ne le dira : une
-- déclaration de volatilité fausse ne produit aucune erreur, elle produit un plan en
-- cache.
--
-- Le balayage part du CATALOGUE (§19.5) : toute fonction `public` déclarée `immutable`
-- dont le corps laisse la SESSION choisir un fuseau. Trois formes, et elles se mesurent :
--   · un intervalle de mois ou d'année ajouté à un `timestamptz` ;
--   · un `date` (ou un `timestamp`) converti en `timestamptz` — minuit LOCAL ;
--   · `at time zone` sans zone littérale.
--
-- ⚠️ Et il ne crie PAS sur les innocentes, ce qui est la moitié qu'on oublie d'éprouver :
-- `f_echeance_droits` et `f_prochain_controle` ajoutent des mois à une `date` (calendrier
-- pur), `f_main_courante_charge_utile` écrit `at time zone 'UTC'` (zone littérale). Les
-- trois doivent rester immutables — l'empreinte de la main courante en DÉPEND : calculée
-- dans le fuseau du lecteur, la chaîne d'intégrité se romprait au premier déplacement.

create or replace function f_verifier_volatilite_calendrier()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    for r in
        select p.oid::regprocedure::text as signature,
               p.prosrc as corps,
               -- Un intervalle de CALENDRIER, et un timestamptz sous la main.
               (p.prosrc ~* 'interval\s*''[^'']*(month|mon\M|year|yr\M)'
                and ('timestamptz'::regtype = any (p.proargtypes)
                     or p.prosrc ~* 'timestamptz')) as calendrier_sur_instant,
               -- Un jour civil converti en instant : minuit LOCAL.
               (p.prosrc ~* '::\s*timestamptz') as jour_vers_instant,
               -- ⚠️ **ET LE CAST INVERSE, TROUVÉ PAR MUTATION ET NON PAR RAISONNEMENT.**
               -- `timestamptz::timestamp` lâche le fuseau en lisant `TimeZone` : il rend
               -- l'heure AU CADRAN DU LECTEUR. La première rédaction de ce garde ne le
               -- voyait pas, et la mutation qui l'a révélé était la plus grave des six :
               -- posée sur `f_main_courante_charge_utile`, elle fait calculer l'empreinte
               -- de la main courante de crise dans le fuseau de celui qui la relit — donc
               -- **la chaîne d'intégrité d'un journal en ajout seul se romprait au premier
               -- déplacement**, sur une pièce d'audit. *L'immutabilité de cette fonction
               -- n'est pas une optimisation : c'est ce qui tient la chaîne.*
               -- Le `\y` exclut `::timestamptz`, déjà couvert au-dessus.
               -- ⚠️ **ET `\b` N'EST PAS UNE LIMITE DE MOT EN PostgreSQL** : dans les
               -- expressions avancées, `\b` est le caractère BACKSPACE. Écrit `\bas`, le
               -- motif cherchait un backspace suivi de « as » — il ne mordait donc jamais
               -- sur `cast(x as timestamp)`, et le garde rendait zéro anomalie, c'est-à-dire
               -- ce qu'il rend quand tout va bien. C'est `\y` qu'il faut. Trouvé par
               -- mutation, pas par relecture.
               (p.prosrc ~* '::\s*timestamp\y' or p.prosrc ~* 'cast\s*\([^)]*\yas\s+timestamp\y')
                   as instant_vers_cadran,
               -- `at time zone` dont la zone n'est pas une chaîne littérale.
               --
               -- ⚠️ **PREMIÈRE RÉDACTION FAUSSE, ET LE MOTIF DE L'ERREUR VAUT D'ÊTRE
               -- ÉCRIT** : elle disait `at\s+time\s+zone\s*(?!')`, et elle a signalé
               -- `f_main_courante_charge_utile` — dont la zone EST littérale. Une
               -- lookahead négative derrière `\s*` ne contraint rien : `\s*` peut
               -- matcher le VIDE, la lookahead regarde alors l'espace, et le motif
               -- réussit quelle que soit la suite. On exige donc que le premier
               -- caractère NON BLANC ne soit pas une apostrophe. Éprouvé sur cinq
               -- formes : une espace, deux espaces, un retour à la ligne, une variable,
               -- une colonne.
               (p.prosrc ~* $re$at\s+time\s+zone\s*[^\s']$re$) as zone_non_litterale
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.provolatile = 'i'
         order by 1
    loop
        if not (r.calendrier_sur_instant or r.jour_vers_instant
                or r.instant_vers_cadran or r.zone_non_litterale) then
            continue;
        end if;
        objet    := r.signature;
        anomalie := 'immutable_mais_depend_du_fuseau';
        detail   := format(
            'Cette fonction se déclare IMMUTABLE et son résultat dépend du réglage '
            'TimeZone de la session%s%s%s. C''est une promesse FAUSSE faite au '
            'planificateur : il peut replier l''expression à la planification et réemployer '
            'le plan dans une session dont le fuseau diffère — et si elle entre un jour dans '
            'un index ou une colonne engendrée, les valeurs stockées seront celles du fuseau '
            'de celui qui a écrit. Déclarer STABLE. ⚠️ Ne PAS « réparer » en remplaçant un '
            'mois de calendrier par un nombre d''heures : février en compte 672 et mars 744. '
            'Le défaut qui a fait naître ce garde a refusé une première installation chez un '
            'client (migration 074), pendant que le banc était vert sur une machine en UTC.',
            case when r.calendrier_sur_instant
                 then ' — un intervalle de mois ou d''année ajouté à un timestamptz' else '' end,
            case when r.jour_vers_instant
                 then ' — un jour civil converti en instant (::timestamptz prend minuit LOCAL)' else '' end,
            case when r.instant_vers_cadran
                 then ' — un instant ramené au cadran du lecteur (::timestamp lit TimeZone)' else '' end,
            case when r.zone_non_litterale
                 then ' — « at time zone » sans zone littérale' else '' end);
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_volatilite_calendrier() is
    'Garde-fou de CLASSE : aucune fonction « public » déclarée IMMUTABLE ne laisse la '
    'SESSION choisir un fuseau horaire. Balaie le catalogue (CONVENTIONS.md §19.5) et '
    'cherche trois formes mesurables : un intervalle de mois ou d''année sur un '
    'timestamptz, un jour civil converti en instant, un « at time zone » sans zone '
    'littérale. ⚠️ Il doit rester MUET sur f_echeance_droits et f_prochain_controle (mois '
    'ajoutés à une « date » : calendrier pur) et sur f_main_courante_charge_utile '
    '(« at time zone ''UTC'' », zone littérale — et son immutabilité est NÉCESSAIRE : '
    'calculée dans le fuseau du lecteur, l''empreinte de la main courante se romprait). '
    'Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §5 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('074', 'une échéance de calendrier dépend du fuseau : l''horloge réglementaire '
               'cesse de se déclarer IMMUTABLE, son garde compare des INSTANTS sur deux '
               'mois témoins au lieu d''un nombre d''heures, et un garde de classe refuse '
               'toute fonction immutable qui laisse la session choisir un fuseau — le '
               'défaut avait refusé une première installation chez un client')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   Les deux fonctions d'horloge peuvent être redéclarées `immutable` et le garde ramené à
--   un attendu en heures — mais c'est rouvrir un refus d'installation dans tout fuseau
--   dont le changement d'heure tombe entre deux témoins. Le garde de classe :
--     drop function if exists f_verifier_volatilite_calendrier();
--     delete from controles_schema where fonction = 'f_verifier_volatilite_calendrier';
-- =====================================================================================
