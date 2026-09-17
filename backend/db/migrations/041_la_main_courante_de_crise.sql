-- =====================================================================================
--  041 — LA MAIN COURANTE DE CRISE : en ajout seul, comme le journal
-- -------------------------------------------------------------------------------------
--  §1  La table `main_courante`
--  §2  Le chaînage — numéro, horodatage, auteur et empreintes viennent du SERVEUR
--  §3  L'AJOUT SEUL — les quatre couches du §12, RÉUTILISÉES
--  §4  Cloisonnement
--  §5  La vérification de la chaîne — `f_main_courante_verifier()`
--  §6  Le garde-fou
--  §7  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — action 20.5 du `docs/PLAN_PRODUIT.md` (lot L20)
--
--  Pendant une crise, on note. Qui a été prévenu, à quelle heure, ce qui a été décidé,
--  ce qu'on a constaté. Cette main courante est la **pièce centrale du retour
--  d'expérience**, et c'est elle qu'un assureur, un client ou l'ANSSI demandent après.
--
--  ── ⚠️ LE CRITÈRE TIENT EN UNE PHRASE, ET IL EST NÉGATIF ────────────────────────────
--
--  *« Ajout seul comme le journal d'audit : une main courante rééditable ne prouve rien.
--  Elle réutilise les quatre couches du §12 des conventions, elle ne les réinvente pas. »*
--
--  Une main courante qu'on peut relire à froid, corriger, compléter « pour que ce soit
--  plus clair », est un document rédigé APRÈS — donc sans valeur probante. Ce qui la rend
--  utile est précisément ce qui la rend inconfortable : **on n'y revient pas**. Une
--  correction s'ajoute, elle ne remplace pas.
--
--  ── CE QUI EST RÉUTILISÉ, ET CE QUI EST PROPRE ──────────────────────────────────────
--
--  Réutilisé **tel quel** : `f_interdit_modification()` (migration `001`), les quatre
--  couches d'ajout seul, la discipline de chaînage par empreinte, et la règle du §17.8 —
--  *tout ce qui fait la valeur probante d'une trace vient du serveur, jamais de
--  l'appelant*.
--
--  Propre à cette table, et c'est une décision : **la chaîne est PAR INCIDENT**, pas
--  globale. Motif : ce qu'on produit en fin de crise est la main courante D'UNE crise. Une
--  chaîne globale obligerait, pour prouver qu'il ne manque rien, à exporter les entrées de
--  toutes les crises de la filiale — y compris celles qui ne regardent pas le
--  destinataire. Numérotée par incident, elle se vérifie seule.
--
--  ── ⚠️ ET CE QUE CETTE TABLE N'EST PAS ──────────────────────────────────────────────
--
--  Ce n'est **pas** le journal d'audit. Le journal enregistre ce que le LOGICIEL a fait ;
--  la main courante enregistre ce que les HUMAINS ont fait, y compris hors du logiciel —
--  un appel téléphonique, une décision prise en salle. Les deux se complètent et aucun ne
--  remplace l'autre.
-- =====================================================================================

begin;

select set_config('grc.utilisateur', 'migration-041', true);
select set_config('grc.filiales',
                  (select coalesce(string_agg(id, ','), '') from filiales), true);

-- =====================================================================================
-- §1 — LA TABLE `main_courante`
-- -------------------------------------------------------------------------------------
-- ⚠️ **Elle DÉROGE aux §3 et §6, exactement comme `journal_audit`, et pour les mêmes
-- raisons** : pas de `version`, pas de `modifie_le`, pas de `modifie_par` — une entrée
-- n'est jamais modifiée, ces colonnes n'auraient aucun sens. `cree_le` est remplacé par
-- `horodatage`, positionné par le serveur, jamais par le client.
--
-- ⚠️ **Aucune clé étrangère vers `utilisateurs`**, et c'est le §12 point 3 appliqué : la
-- trace doit survivre à la disparition du compte. `auteur_libelle` reste lisible quand le
-- compte n'existe plus.
-- =====================================================================================

create table if not exists main_courante (
    id            id_metier   not null default f_generer_id('MC'),
    filiale_id    id_metier   not null,

    -- ── ⚠️ L'INCIDENT EST DÉSIGNÉ, PAS RÉFÉRENCÉ — ET C'EST LE §12 POINT 3 ──────────
    --
    -- **Aucune clé étrangère vers `incidents`**, exactement comme le journal d'audit n'en
    -- porte aucune vers ce qu'il décrit : *« le journal doit survivre à la suppression de
    -- ce qu'il décrit »*. Une main courante est du même ordre — le récit d'une crise est
    -- une pièce qui vaut par elle-même, et qui doit rester lisible quand la fiche
    -- d'incident a disparu.
    --
    -- ⚠️ **La première rédaction posait une clé composite en `restrict`, et le banc l'a
    -- refusée dans l'heure.** Elle mettait DEUX invariants en conflit : l'ajout seul
    -- interdit de supprimer une entrée, et `restrict` interdisait de supprimer l'incident
    -- — si bien que `POST /api/reprise` en mode « remplacer » ne pouvait plus purger une
    -- filiale qui avait connu une crise. Restaurer une sauvegarde y devenait impossible,
    -- **définitivement**. C'est la forme exacte du constat **Q-284**, où l'irréversibilité
    -- d'une décision d'approbation rendait toute suppression en cascade impossible.
    --
    -- Le §12 avait la réponse écrite depuis le premier jour : on ne référence pas ce qu'on
    -- décrit. Le prix est une main courante qui peut devenir orpheline ; c'est le prix que
    -- le journal d'audit paie déjà, et c'est le bon.
    incident_id   id_metier   not null,

    -- Position dans la chaîne DE CET INCIDENT, attribuée par le déclencheur du §2.
    numero        integer     not null,
    horodatage    timestamptz not null default clock_timestamp(),

    -- L'auteur vient de la SESSION (§17.8, constat N-5). Le libellé, lui, est fourni :
    -- c'est un confort de lecture qui doit survivre à la disparition du compte (§12).
    auteur        text        not null default f_utilisateur_courant(),
    auteur_libelle text,

    categorie     text        not null default 'constat',
    texte         text        not null,

    empreinte_precedente empreinte_sha256,
    empreinte     empreinte_sha256 not null,

    constraint pk_main_courante primary key (id),
    -- L'unicité porte `filiale_id` (§19.1) ET l'incident : la chaîne est par incident, et
    -- sans la filiale une filiale occuperait le numéro d'une autre sur un identifiant
    -- d'incident qu'elle ne voit pas (constat Q-2).
    constraint uq_main_courante_numero unique (filiale_id, incident_id, numero),

    constraint fk_main_courante_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    constraint ck_main_courante_categorie check (categorie in (
        'constat', 'decision', 'action', 'communication', 'escalade', 'cloture')),
    constraint ck_main_courante_texte check (texte <> '' and length(texte) <= 8000),
    constraint ck_main_courante_numero check (numero > 0),
    -- L'entrée de genèse d'un incident, et elle seule, n'a pas de précédente.
    constraint ck_main_courante_genese check (numero > 1 or empreinte_precedente is null)
);

comment on table main_courante is
    'Main courante de crise — action 20.5. EN AJOUT SEUL, par les quatre couches du '
    'CONVENTIONS.md §12, RÉUTILISÉES et non réinventées : une main courante rééditable ne '
    'prouve rien. ⚠️ Elle DÉROGE aux §3 et §6 comme journal_audit : ni version, ni '
    'modifie_le, ni modifie_par — une entrée ne se corrige pas, la correction s''AJOUTE. '
    '⚠️ La chaîne est PAR INCIDENT : ce qu''on produit en fin de crise est la main courante '
    'D''UNE crise, et une chaîne globale obligerait à exporter celles des autres pour '
    'prouver qu''il ne manque rien. ⚠️ Ce n''est PAS le journal d''audit : le journal dit ce '
    'que le LOGICIEL a fait, la main courante ce que les HUMAINS ont fait — y compris hors '
    'du logiciel, un appel, une décision prise en salle.';

comment on column main_courante.incident_id is
    'L''incident dont c''est la crise — DÉSIGNÉ, pas référencé. Aucune clé étrangère : le '
    'récit doit survivre à la suppression de la fiche d''incident (§12 point 3, la règle '
    'du journal d''audit). ⚠️ La route vérifie néanmoins, à l''écriture, que l''incident '
    'est dans le périmètre de la session — ce n''est pas le cloisonnement, c''est la '
    'qualité de la donnée : une faute de frappe créerait un récit que personne ne '
    'retrouverait.';
comment on column main_courante.numero is
    'Position dans la chaîne DE CET INCIDENT, attribuée par le déclencheur (max + 1), pas '
    'par une séquence : une séquence attribue son numéro AVANT le déclencheur et peut '
    'valider dans le désordre — la chaîne ne correspondrait plus à l''ordre des numéros.';
comment on column main_courante.auteur is
    'Identifiant de session, ÉCRASÉ par le déclencheur : une main courante inaltérable dont '
    'l''auteur est déclaré par le client garantit l''intégrité d''une fausse preuve '
    '(constat N-5, §17.8).';
comment on column main_courante.empreinte is
    'sha256 de la sérialisation canonique de TOUS les champs de l''entrée, '
    'empreinte_precedente comprise. Retoucher une entrée invalide son empreinte ; '
    'recalculer l''empreinte rompt le chaînage de la suivante ; supprimer une entrée laisse '
    'un numéro manquant. Les trois se constatent (§12).';

create index ix_main_courante_incident on main_courante (filiale_id, incident_id, numero);

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('main_courante', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('main_courante', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('main_courante', 'incident_id', 'non_personnelle', null, null, null, null,
   'Identifiant de l''incident dont c''est la crise.'),
  ('main_courante', 'numero', 'non_personnelle', null, null, null, null,
   'Position dans la chaîne : une valeur technique.'),
  ('main_courante', 'horodatage', 'non_personnelle', null, null, null, null,
   'Instant de l''entrée, posé par le serveur.'),
  -- ⚠️ « conserver », comme le journal d'audit et pour le même motif : anonymiser
  -- l'auteur d'une entrée de main courante détruirait la valeur probante de la pièce —
  -- « quelqu'un a décidé à 3 h 12 » ne vaut rien. La main courante n'est pas purgée.
  ('main_courante', 'auteur', 'personnelle',
   'Attribuer chaque entrée de la main courante à son auteur, pour que le récit de la '
   'crise soit opposable.',
   'Intérêt légitime', 1095, 'conserver',
   'Identifiant de connexion. ⚠️ « conserver » : une main courante dont on ne sait plus qui '
   'a écrit quoi ne prouve plus rien — c''est l''arbitrage du journal d''audit (§12), et il '
   'vaut ici mot pour mot.'),
  ('main_courante', 'auteur_libelle', 'personnelle',
   'Rendre l''auteur lisible même si son compte a disparu.',
   'Intérêt légitime', 1095, 'conserver',
   'Nom d''affichage. Même arbitrage que ci-dessus.'),
  ('main_courante', 'categorie', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : constat / decision / action / communication / escalade / cloture.'),
  ('main_courante', 'texte', 'personnelle',
   'Consigner ce qui a été constaté, décidé ou fait pendant la crise.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom y figure presque toujours '
   '— « prévenu M. Ollier à 3 h 12 ». Régime « signaler » : le produit le montre, un '
   'humain tranche. ⚠️ Une purge automatique effacerait le récit d''une crise.'),
  ('main_courante', 'empreinte_precedente', 'non_personnelle', null, null, null, null,
   'Empreinte de l''entrée précédente : une valeur technique de chaînage.'),
  ('main_courante', 'empreinte', 'non_personnelle', null, null, null, null,
   'Empreinte de l''entrée : une valeur technique de chaînage.')
on conflict (table_nom, colonne) do nothing;

-- ── ⚠️ PAS DE COLONNE `provenance`, ET C'EST UNE DÉCISION PAYÉE ─────────────────────
--
-- Toute table métier en porte une depuis la migration `032` — sauf trois écarts déclarés,
-- et sauf `journal_audit`, que le prédicat de la `032` écarte parce qu'elle n'a pas de
-- `cree_par`. `main_courante` est dans le même cas, et pour la même raison de fond : sa
-- provenance est dite par sa nature. Une entrée de main courante est écrite par un humain
-- pendant une crise, signée et chaînée ; « de découverte » n'a pas de sens pour elle.
--
-- ⚠️ **La première rédaction en posait une, et le banc l'a refusée.** `purgerJeu()` (jeu
-- de découverte, L18 bis) balaie **toute table portant `provenance`** et y fait un
-- `delete`. Sur une table en ajout seul, ce `delete` est refusé — **même quand il ne
-- toucherait aucune ligne**, puisque le déclencheur est posé « for each statement ». La
-- purge du jeu de découverte devenait donc impossible dès que cette migration était
-- appliquée : la **cinquième condition constitutive** du lot L18 bis tombait.
--
-- C'est la TROISIÈME fois dans cette même livraison qu'un invariant d'ajout seul entre en
-- conflit avec un balayage qui supprime — après la clé étrangère vers `incidents` et la
-- purge de `POST /api/reprise`. Les deux remèdes sont posés : la colonne n'est pas là, et
-- `purgerJeu()` ne balaie plus que les tables où le rôle applicatif PEUT supprimer.

-- =====================================================================================
-- §2 — LE CHAÎNAGE
-- -------------------------------------------------------------------------------------
-- ⚠️ **Le client ne fournit ni numéro, ni horodatage, ni auteur, ni empreintes : tout est
-- écrasé ici.** Il n'existe donc aucun moyen de forger une entrée cohérente par l'API.
-- C'est la règle du §17.8, et le constat N-5 l'a coûtée une fois : *une trace inaltérable
-- dont l'acteur est déclaré par le client garantit l'intégrité d'une fausse preuve.*
--
-- Le verrou consultatif sérialise les insertions D'UN MÊME INCIDENT jusqu'au commit : sa
-- clé est dérivée de l'identifiant, ce qui laisse deux crises simultanées s'écrire sans
-- s'attendre — et il n'y a pas de raison qu'elles s'attendent, leurs chaînes sont
-- distinctes.
-- =====================================================================================

create or replace function f_main_courante_charge_utile(
    p_numero integer, p_id text, p_horodatage timestamptz, p_filiale_id text,
    p_incident_id text, p_auteur text, p_auteur_libelle text, p_categorie text,
    p_texte text, p_empreinte_precedente text)
returns text
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    -- ⚠️ Sérialisation CANONIQUE, et le séparateur compte : un caractère qui ne peut pas
    -- figurer dans les valeurs, sans quoi deux entrées différentes pourraient produire la
    -- même chaîne — « a|b » et « a » suivi de « b ». Le caractère d'unité (U+001F) est
    -- refusé par le domaine id_metier et n'a rien à faire dans un texte saisi.
    select concat_ws(chr(31),
        p_numero::text, p_id, to_char(p_horodatage at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        p_filiale_id, p_incident_id, coalesce(p_auteur, ''), coalesce(p_auteur_libelle, ''),
        p_categorie, p_texte, coalesce(p_empreinte_precedente, ''));
$$;

comment on function f_main_courante_charge_utile(
    integer, text, timestamptz, text, text, text, text, text, text, text) is
    'Sérialisation CANONIQUE d''une entrée de main courante, dont on prend l''empreinte. '
    'Le séparateur est le caractère d''unité (U+001F), qui ne peut figurer dans aucune '
    'valeur : un séparateur présent dans les données ferait que deux entrées distinctes '
    'produisent la même chaîne, et donc la même empreinte.';

create or replace function f_main_courante_chainage() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_precedent record;
begin
    -- ── UNE CLÉ DE VERROU PAR CRISE ─────────────────────────────────────────────────
    --
    -- Le journal d'audit prend un verrou GLOBAL (clé 4718271936042001) : sa chaîne est
    -- unique, tout doit s'y sérialiser. Ici la chaîne est par incident, et faire attendre
    -- une crise derrière une autre n'aurait aucun objet — ce sont deux récits distincts.
    --
    -- ⚠️ La clé dérive d'un HACHAGE, et il faut dire ce que cela coûte : deux crises
    -- peuvent tomber sur la même clé et se sérialiser inutilement. C'est un coût de
    -- débit, jamais un défaut de justesse — « max(numero) » est filtré sur l'incident, et
    -- deux chaînes ne peuvent pas se mêler même si leurs insertions s'attendent.
    --
    -- `hashtextextended` rend un `bigint`, qui est la seule forme à un argument de
    -- `pg_advisory_xact_lock` ; la forme à deux arguments prend deux `integer`, et la
    -- première rédaction de cette ligne lui passait un `bigint` — refusée à l'exécution,
    -- pas à la compilation. Un corps PL/pgSQL n'est vérifié qu'au premier appel.
    perform pg_advisory_xact_lock(
        hashtextextended(new.filiale_id || chr(31) || new.incident_id, 4718271936042005));

    select m.numero, m.empreinte
      into v_precedent
      from main_courante m
     where m.incident_id = new.incident_id and m.filiale_id = new.filiale_id
     order by m.numero desc
     limit 1;

    new.numero               := coalesce(v_precedent.numero, 0) + 1;
    new.empreinte_precedente := v_precedent.empreinte;   -- null pour la genèse
    new.horodatage           := clock_timestamp();
    -- ⚠️ ÉCRASÉ SANS CONDITION (§17.8, constat N-5).
    new.auteur               := f_utilisateur_courant();

    new.empreinte := encode(sha256(convert_to(
        f_main_courante_charge_utile(
            new.numero, new.id, new.horodatage, new.filiale_id, new.incident_id,
            new.auteur, new.auteur_libelle, new.categorie, new.texte,
            new.empreinte_precedente),
        'UTF8')), 'hex');

    return new;
end;
$$;

comment on function f_main_courante_chainage() is
    'Attribue numero, horodatage, auteur, empreinte_precedente et empreinte à chaque '
    'entrée : TOUT ce qui fait la valeur probante d''une trace vient du serveur, jamais de '
    'l''appelant (§17.8). ⚠️ Le numéro vient de « max + 1 » et non d''une séquence : une '
    'séquence attribue AVANT le déclencheur et peut valider dans le désordre. Sérialisé '
    'par un verrou consultatif dont la clé dérive de l''incident — deux crises simultanées '
    'ne s''attendent pas, leurs chaînes étant distinctes.';

drop trigger if exists trg_main_courante_chainage on main_courante;
create trigger trg_main_courante_chainage before insert on main_courante
    for each row execute function f_main_courante_chainage();

-- =====================================================================================
-- §3 — L'AJOUT SEUL : LES QUATRE COUCHES DU §12, RÉUTILISÉES
-- -------------------------------------------------------------------------------------
-- | # | Couche | Ce qu'elle bloque |
-- |---|---|---|
-- | 1 | `revoke update, delete, truncate` du rôle applicatif | l'API, même compromise, n'a pas le verbe SQL |
-- | 2 | déclencheurs `before update/delete/truncate` en `for each statement` | la tentative échoue BRUYAMMENT, y compris sur un update qui ne toucherait aucune ligne |
-- | 3 | `enable always trigger` | `set session_replication_role = replica` ne les désarme pas |
-- | 4 | le rôle applicatif n'est pas propriétaire | seul le propriétaire peut `disable trigger` |
--
-- ⚠️ **`f_interdit_modification()` est RÉUTILISÉE, pas recopiée.** Elle vit dans la
-- migration `001` et sert déjà `journal_audit`. Une seconde rédaction aurait divergé au
-- premier ajustement du message — et c'est le message qui dit à l'utilisateur quoi faire :
-- *« une entrée ne se corrige pas : ajoutez-en une nouvelle décrivant la correction »*.
-- =====================================================================================

revoke all on main_courante from public;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'revoke update, delete, truncate on main_courante from grc_app';
        execute 'grant  select, insert on main_courante to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on main_courante to grc_lecture';
    end if;
end;
$$;

drop trigger if exists trg_main_courante_interdit_maj    on main_courante;
drop trigger if exists trg_main_courante_interdit_suppr  on main_courante;
drop trigger if exists trg_main_courante_interdit_vidage on main_courante;

create trigger trg_main_courante_interdit_maj before update on main_courante
    for each statement execute function f_interdit_modification();
create trigger trg_main_courante_interdit_suppr before delete on main_courante
    for each statement execute function f_interdit_modification();
create trigger trg_main_courante_interdit_vidage before truncate on main_courante
    for each statement execute function f_interdit_modification();

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Les QUATRE politiques, comme `journal_audit` — y compris celles de modification et de
-- suppression, que les déclencheurs du §3 refusent de toute façon. ⚠️ Elles ne sont pas
-- décoratives : le garde-fou de couverture RLS exige une écriture cloisonnée sur les
-- quatre commandes, et une table qui n'en porterait que deux serait rangée parmi les
-- registres techniques — c'est-à-dire sortie du balayage de cloisonnement.
-- =====================================================================================

alter table main_courante enable row level security;
alter table main_courante force  row level security;

drop policy if exists pol_main_courante_lecture     on main_courante;
drop policy if exists pol_main_courante_ajout       on main_courante;
drop policy if exists pol_main_courante_maj         on main_courante;
drop policy if exists pol_main_courante_suppression on main_courante;

create policy pol_main_courante_lecture on main_courante for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_main_courante_ajout on main_courante for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_main_courante_maj on main_courante for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_main_courante_suppression on main_courante for delete
    using (filiale_id = f_filiale_ecriture());

comment on policy pol_main_courante_maj on main_courante is
    'Modification : dans la seule filiale active — et REFUSÉE DE TOUTE FAÇON par '
    'trg_main_courante_interdit_maj (§12, couche 2). La politique existe pour que le '
    'garde-fou de couverture RLS trouve une écriture cloisonnée sur les quatre commandes ; '
    'sans elle, la table serait rangée parmi les registres techniques, donc sortie du '
    'balayage de cloisonnement.';

-- L'armement, qui est une TROISIÈME chose (§19.4) : on DÉCOUVRE, on ne recopie pas.
select f_armer_declencheurs();

-- =====================================================================================
-- §5 — LA VÉRIFICATION DE LA CHAÎNE
-- -------------------------------------------------------------------------------------
-- Ce que chaque mécanisme attrape (§12) :
--   · retoucher le contenu d'une entrée        → `empreinte_invalide` SUR CETTE ENTRÉE ;
--   · retoucher le contenu ET l'empreinte      → `chainage_rompu` SUR LA SUIVANTE ;
--   · supprimer une entrée                     → `numero_manquant` ET `chainage_rompu`.
--
-- ⚠️ `empreinte_precedente` est **stockée**, pas recalculée à la lecture : c'est ce qui
-- rend les deux derniers cas détectables.
-- =====================================================================================

create or replace function f_main_courante_verifier(p_incident_id text)
returns table (numero integer, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r          record;
    v_attendu  integer := 0;
    v_prec     text    := null;
    v_calculee text;
begin
    for r in
        select m.* from main_courante m
         where m.incident_id = p_incident_id
         order by m.numero
    loop
        v_attendu := v_attendu + 1;

        if r.numero <> v_attendu then
            numero := r.numero;
            anomalie := 'numero_manquant';
            detail := format('La chaîne saute de %s à %s : une entrée a été retirée.',
                             v_attendu - 1, r.numero);
            return next;
            v_attendu := r.numero;
        end if;

        v_calculee := encode(sha256(convert_to(
            f_main_courante_charge_utile(
                r.numero, r.id, r.horodatage, r.filiale_id, r.incident_id,
                r.auteur, r.auteur_libelle, r.categorie, r.texte, r.empreinte_precedente),
            'UTF8')), 'hex');

        if v_calculee is distinct from r.empreinte then
            numero := r.numero;
            anomalie := 'empreinte_invalide';
            detail := 'Le contenu de cette entrée a changé depuis son écriture : son '
                      'empreinte ne correspond plus à ce qu''elle porte.';
            return next;
        end if;

        if r.empreinte_precedente is distinct from v_prec then
            numero := r.numero;
            anomalie := 'chainage_rompu';
            detail := 'L''empreinte de l''entrée précédente, figée ici à l''écriture, ne '
                      'correspond plus à celle que porte l''entrée précédente : une entrée '
                      'a été retouchée ou retirée avant celle-ci.';
            return next;
        end if;

        v_prec := r.empreinte;
    end loop;

    return;
end;
$$;

comment on function f_main_courante_verifier(text) is
    'Vérifie la chaîne de la main courante D''UN INCIDENT. Rend une ligne par anomalie : '
    'numero_manquant (une entrée retirée), empreinte_invalide (le contenu d''une entrée a '
    'changé), chainage_rompu (une entrée antérieure a été retouchée ou retirée). ⚠️ Elle '
    'ne protège pas CONTRE le DBA système — root et le propriétaire peuvent désactiver un '
    'déclencheur —, elle rend son passage DÉTECTABLE. C''est exactement ce que dit le §12 '
    'du journal d''audit, et il faut le dire aussi ici plutôt que de laisser croire à une '
    'garantie qui n''existe pas (§17.5).';

grant execute on function f_main_courante_verifier(text) to grc_app;

-- =====================================================================================
-- §6 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ Il MESURE les quatre couches dans le catalogue — privilèges réels, `tgtype` et
-- `tgenabled` réels —, il ne lit aucun texte et aucune ligne (§39 et §41).
-- =====================================================================================

create or replace function f_verifier_main_courante()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_cas    record;
    v_tgtype smallint;
    v_arme   "char";
begin
    /* ── COUCHE 1 : le rôle applicatif n'a pas le verbe SQL ───────────────────────── */
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        for v_cas in
            select * from (values ('UPDATE'), ('DELETE'), ('TRUNCATE')) as c(verbe)
        loop
            if has_table_privilege('grc_app', 'main_courante', v_cas.verbe) then
                objet    := 'main_courante';
                anomalie := 'ajout_seul_privilege';
                detail   := format(
                    'Le rôle applicatif a le privilège %s sur main_courante. La première '
                    'des quatre couches du §12 est tombée : l''API, si elle est compromise, '
                    'peut réécrire le récit d''une crise.', v_cas.verbe);
                return next;
            end if;
        end loop;
    end if;

    /* ── COUCHE 2 et 3 : les trois déclencheurs, MESURÉS sur tgtype ET tgenabled ──── */
    /* Leçon Q-281 : vérifier qu'un déclencheur EXISTE ne dit rien de ce qu'il écoute.
       Bits de tgtype : 1 = par ligne (donc 0 = par instruction), 2 = BEFORE,
       4 = INSERT, 8 = DELETE, 16 = UPDATE, 32 = TRUNCATE. */
    for v_cas in
        select * from (values
            ('trg_main_courante_interdit_maj',    16, 'un UPDATE'),
            ('trg_main_courante_interdit_suppr',   8, 'un DELETE'),
            ('trg_main_courante_interdit_vidage', 32, 'un TRUNCATE')
        ) as c(nom, bit, quoi)
    loop
        select t.tgtype, t.tgenabled into v_tgtype, v_arme
          from pg_trigger t
         where t.tgrelid = 'main_courante'::regclass and not t.tgisinternal
           and t.tgname = v_cas.nom;

        if v_tgtype is null then
            objet    := 'main_courante';
            anomalie := 'ajout_seul_declencheur_absent';
            detail   := format(
                '%s a disparu : %s sur la main courante réussirait en silence. Une main '
                'courante rééditable ne prouve rien — c''est le critère de l''action 20.5.',
                v_cas.nom, v_cas.quoi);
            return next;
        else
            if (v_tgtype & 1) <> 0 or (v_tgtype & 2) <> 2 or (v_tgtype & v_cas.bit) <> v_cas.bit
            then
                objet    := 'main_courante';
                anomalie := 'ajout_seul_declencheur_mal_arme';
                detail   := format(
                    '%s n''est plus un « before %s » PAR INSTRUCTION (tgtype = %s). Par '
                    'ligne, il ne verrait pas un UPDATE qui ne touche aucune ligne ; sur un '
                    'autre événement, il ne voit rien du tout.',
                    v_cas.nom, v_cas.quoi, v_tgtype);
                return next;
            end if;
            -- COUCHE 3 : « always », sans quoi `session_replication_role = replica` le
            -- désarme — et l'ajout seul se contourne par un réglage de session.
            if v_arme <> 'A' then
                objet    := 'main_courante';
                anomalie := 'ajout_seul_desarmable';
                detail   := format(
                    '%s est armé « %s » et non « always » : la troisième couche du §12 est '
                    'tombée, et « set session_replication_role = replica » suffit à le '
                    'neutraliser.', v_cas.nom, v_arme);
                return next;
            end if;
        end if;
    end loop;

    /* ── COUCHE 4 : le rôle applicatif n'est pas propriétaire ─────────────────────── */
    if exists (
        select 1 from pg_class c join pg_roles r on r.oid = c.relowner
         where c.oid = 'main_courante'::regclass and r.rolname = 'grc_app')
    then
        objet    := 'main_courante';
        anomalie := 'ajout_seul_proprietaire';
        detail   := 'Le rôle applicatif est PROPRIÉTAIRE de main_courante : il peut donc '
                    '« alter table … disable trigger », et les trois couches précédentes '
                    'tombent avec.';
        return next;
    end if;

    /* ── LA DÉROGATION DU §12 : ni version, ni modifie_le, ni modifie_par ─────────── */
    /* Leur apparition signifierait que quelqu'un a cru la table modifiable — et le
       prochain lecteur le croira aussi. */
    for v_cas in
        select * from (values ('version'), ('modifie_le'), ('modifie_par')) as c(colonne)
    loop
        if exists (
            select 1 from pg_attribute a
             where a.attrelid = 'main_courante'::regclass and a.attname = v_cas.colonne
               and a.attnum > 0 and not a.attisdropped)
        then
            objet    := 'main_courante.' || v_cas.colonne;
            anomalie := 'colonne_de_modification';
            detail   := 'Cette colonne n''a aucun sens sur une table en ajout seul, et sa '
                        'présence donne à croire que la table se modifie. C''est la '
                        'dérogation assumée du §12, et elle se garde.';
            return next;
        end if;
    end loop;

    /* ── AUCUNE COLONNE `provenance` ──────────────────────────────────────────────── */
    /* Elle ferait entrer la table dans le balayage de `purgerJeu()` (jeu de découverte),
       qui y ferait un `delete` — refusé par l'ajout seul MÊME SANS LIGNE À SUPPRIMER, le
       déclencheur étant posé « for each statement ». La purge du jeu de découverte
       deviendrait impossible, et sa cinquième condition constitutive tomberait. */
    if exists (
        select 1 from pg_attribute a
         where a.attrelid = 'main_courante'::regclass and a.attname = 'provenance'
           and a.attnum > 0 and not a.attisdropped)
    then
        objet    := 'main_courante.provenance';
        anomalie := 'provenance_sur_table_en_ajout_seul';
        detail   := 'Cette colonne fait entrer la table dans le balayage de purgerJeu(), '
                    'qui y fera un « delete » — refusé par l''ajout seul MÊME s''il ne '
                    'touche aucune ligne, le déclencheur étant « for each statement ». La '
                    'purge du jeu de découverte deviendrait impossible. La provenance d''une '
                    'entrée de main courante est dite par sa nature : elle est écrite par '
                    'un humain, signée et chaînée.';
        return next;
    end if;

    /* ── AUCUNE CLÉ ÉTRANGÈRE VERS CE QU'ELLE DÉCRIT (§12 point 3) ────────────────── */
    /* Une clé vers `incidents` remettrait en conflit l'ajout seul et la purge de la
       reprise : plus aucune filiale ayant connu une crise ne pourrait être restaurée.
       C'est la forme exacte du constat Q-284, et elle s'est présentée ici. */
    if exists (
        select 1 from pg_constraint c
         where c.conrelid = 'main_courante'::regclass and c.contype = 'f'
           and c.confrelid = 'incidents'::regclass)
    then
        objet    := 'main_courante';
        anomalie := 'reference_vers_l_incident';
        detail   := 'Une clé étrangère vers « incidents » est apparue. Le §12 point 3 '
                    'l''interdit : le récit d''une crise doit survivre à la suppression de '
                    'ce qu''il décrit. Et elle remettrait l''ajout seul en conflit avec la '
                    'purge de POST /api/reprise — une filiale ayant connu une crise ne '
                    'pourrait plus JAMAIS être restaurée (classe du constat Q-284).';
        return next;
    end if;

    /* ── LE CHAÎNAGE EST POSÉ ─────────────────────────────────────────────────────── */
    select t.tgtype into v_tgtype
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'main_courante'::regclass and not t.tgisinternal
       and p.proname = 'f_main_courante_chainage';
    if v_tgtype is null then
        objet    := 'main_courante';
        anomalie := 'chainage_absent';
        detail   := 'trg_main_courante_chainage a disparu : le numéro, l''horodatage, '
                    'l''auteur et les empreintes viendraient alors de l''APPELANT. Une trace '
                    'inaltérable dont l''acteur est déclaré par le client garantit '
                    'l''intégrité d''une FAUSSE preuve (constat N-5).';
        return next;
    elsif (v_tgtype & 1) <> 1 or (v_tgtype & 2) <> 2 or (v_tgtype & 4) <> 4 then
        objet    := 'main_courante';
        anomalie := 'chainage_mal_arme';
        detail   := format('trg_main_courante_chainage n''est plus un « before insert » par '
                           'ligne (tgtype = %s).', v_tgtype);
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_main_courante() is
    'Vérifie que la main courante est bien EN AJOUT SEUL (action 20.5) — les quatre '
    'couches du CONVENTIONS.md §12, MESURÉES dans le catalogue : (1) le rôle applicatif '
    'n''a ni UPDATE, ni DELETE, ni TRUNCATE ; (2) les trois déclencheurs de refus existent '
    'et sont « before … FOR EACH STATEMENT » — par ligne, ils ne verraient pas un update '
    'qui ne touche aucune ligne ; (3) ils sont armés « always », sans quoi '
    '« session_replication_role = replica » les désarme ; (4) le rôle applicatif n''est pas '
    'propriétaire. Plus la dérogation du §12 — ni version, ni modifie_le, ni modifie_par — '
    'et le déclencheur de chaînage. Ne lit AUCUNE ligne (§41).';

grant execute on function f_verifier_main_courante() to grc_app;

-- =====================================================================================
-- §7 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
-- =====================================================================================

do $$
declare v_mouvements text;
begin
    select string_agg(format('%s : %s', garde_fou, mouvement), ', ')
      into v_mouvements from f_consigner_controles_schema();
    if v_mouvements is not null then
        raise notice 'Registre des garde-fous : %', v_mouvements;
    end if;
end;
$$;

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 041 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, main courante comprise.';
end;
$$;

insert into migrations_schema (version, nom)
values ('041', 'la main courante de crise, EN AJOUT SEUL — les quatre couches du §12 '
               'réutilisées, et une chaîne par incident (20.5)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop table if exists main_courante;
--   drop function if exists f_verifier_main_courante();
--   drop function if exists f_main_courante_verifier(text);
--   drop function if exists f_main_courante_chainage();
--   drop function if exists f_main_courante_charge_utile(
--       integer, text, timestamptz, text, text, text, text, text, text, text);
--   delete from controles_schema where fonction = 'f_verifier_main_courante';
--   delete from colonnes_personnelles where table_nom = 'main_courante';
--   delete from migrations_schema where version = '041';
--   commit;
-- ⚠️ La rejouer DÉTRUIT des mains courantes de crise, qui sont des pièces de retour
--    d'expérience et parfois des pièces d'assurance. Exporter d'abord.
-- =====================================================================================
