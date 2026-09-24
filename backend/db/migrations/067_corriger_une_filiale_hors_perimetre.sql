-- =====================================================================================
--  067 — CORRIGER UNE FILIALE QUE LA SESSION NE LIT PAS
--
--  §1  La fonction d'écriture
--  §2  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — trouvée PAR LE BANC, et c'est la troisième couche
--
--  La correction de l'identité d'une filiale (`PUT /api/filiales/:id`, 24/09/2026) écrivait
--  par un `update` ordinaire. L'essai l'a refusée avec un message trompeur :
--
--      « Cette filiale a été modifiée entre-temps par quelqu'un d'autre. »
--
--  🛑 **Elle ne l'avait pas été.** `update` rendait **zéro ligne**, et le code en concluait
--  un conflit de version — l'explication la plus plausible, et la fausse.
--
--  ── LE MÉCANISME, ET C'EST LE MÊME QUE DEPUIS CE MATIN, D'UN CRAN PLUS BAS ───────
--
--  PostgreSQL applique **aussi les politiques de SELECT** à un `update` dès que la commande
--  RÉFÉRENCE des colonnes de la table — ce que fait toute clause `where "version" = $n`.
--  Or `pol_filiales_lecture` retombe sur `id = any (f_filiales_lecture())` dès que
--  `f_perimetre_groupe()` est fausse, et créer une filiale active la rend fausse.
--
--  Autrement dit : **la filiale qu'un administrateur vient de créer est précisément celle
--  qu'il ne peut pas corriger.** C'est la troisième couche du même piège en une journée —
--  après l'écran « Filiales » (migration `065`) et l'écran des habilitations. Les deux
--  premières étaient des LECTURES ; celle-ci est une ÉCRITURE, et elle se manifestait par
--  un message qui accusait un tiers inexistant.
--
--  ── POURQUOI UNE FONCTION, ET PAS UN ÉLARGISSEMENT DE LA POLITIQUE ──────────────
--
--  ⚠️ La tentation était d'ajouter `f_administration_groupe()` à `pol_filiales_lecture`.
--  **C'est interdit, et le produit le refuse par construction** : la migration `004_rls`
--  pose que ce drapeau *« n'apparaît dans aucune politique de select »* — c'est une
--  déclaration qu'une session fait sur elle-même (`CONVENTIONS.md` §17.4), pas un
--  privilège, et l'admettre en lecture ouvrirait la lecture de TOUTES les données à qui
--  la pose. Le garde-fou de la `004` refuse la migration qui l'essaierait.
--
--  L'écriture passe donc par une fonction `security definer` **étroite**, au même titre que
--  `f_filiales_inventaire()` pour la lecture : elle ne touche qu'à `filiales`, elle ne
--  modifie que douze colonnes nommées une par une, et **la barrière reste la déclaration
--  d'accès de la route** — `administrer` + `administration` + `administration-groupe`.
--
--  ── CE QU'ELLE NE TOUCHE PAS, ET C'EST LA MOITIÉ DU SUJET ───────────────────────
--
--  🛑 **`code`** — il nomme les groupes d'annuaire (`GRC-<CODE>-<PROFIL>`). Le changer
--  laisserait dans l'Active Directory du client des groupes qui n'accordent plus rien, que
--  le produit **ne peut pas renommer** puisqu'il n'y écrit pas. Tous leurs membres
--  perdraient l'accès sans un message.
--  🛑 **`statut`, `date_sortie`** — une sortie n'est pas une correction de fiche : elle
--  passe par `POST /api/cycle/sortie-filiale`, qui **exporte d'abord**.
--  🛑 **`version`, `cree_le`, `cree_par`** — le déclencheur `trg_filiales_maj` en est le
--  seul auteur (`CONVENTIONS.md` §3). La fonction ne les nomme pas.
--
--  ⚠️ **`null` veut dire « inchangé », jamais « efface »** (motif du constat Q-192) : un
--  écran qui n'envoie qu'un champ ne doit pas vider les onze autres. Pour vider un champ,
--  l'appelant envoie la **chaîne vide** — ce qui est un geste, pas une omission.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LA FONCTION D'ÉCRITURE
-- =====================================================================================

create or replace function f_filiale_corriger(
    p_id             id_metier,
    p_version        integer,
    p_raison_sociale text default null,
    p_nom_court      text default null,
    p_adresse        text default null,
    p_code_postal    text default null,
    p_ville          text default null,
    p_pays           text default null,
    p_telephone      text default null,
    p_email          text default null,
    p_site_web       text default null,
    p_langue_defaut  text default null,
    p_date_entree    date default null,
    p_notes          text default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_lignes integer;
begin
    -- ⚠️ `coalesce(paramètre, colonne)` : un paramètre NUL laisse la colonne telle
    --    quelle. C'est ce qui fait qu'un écran partiel n'efface rien.
    -- ⚠️ `version` n'est PAS affectée : le déclencheur `trg_filiales_maj` en est
    --    l'unique auteur. L'y écrire ici en ferait un second.
    update filiales f
       set raison_sociale = coalesce(p_raison_sociale, f.raison_sociale),
           nom_court      = coalesce(p_nom_court,      f.nom_court),
           adresse        = coalesce(p_adresse,        f.adresse),
           code_postal    = coalesce(p_code_postal,    f.code_postal),
           ville          = coalesce(p_ville,          f.ville),
           pays           = coalesce(p_pays,           f.pays),
           telephone      = coalesce(p_telephone,      f.telephone),
           email          = coalesce(p_email,          f.email),
           site_web       = coalesce(p_site_web,       f.site_web),
           langue_defaut  = coalesce(p_langue_defaut,  f.langue_defaut),
           date_entree    = coalesce(p_date_entree,    f.date_entree),
           notes          = coalesce(p_notes,          f.notes)
     where f.id = p_id
       and f.version = p_version;

    get diagnostics v_lignes = row_count;
    return v_lignes;
end;
$$;

-- PostgreSQL accorde EXECUTE à PUBLIC par défaut. Une fonction « security definer »
-- qui ÉCRIT et que tout le monde peut appeler est une porte, pas un contournement
-- légitime (constat Q-136). Seul le rôle applicatif l'appelle — et seulement depuis
-- une route déclarée en administration Groupe.
revoke all on function f_filiale_corriger(
    id_metier, integer, text, text, text, text, text, text, text, text, text, text, date, text
) from public;
grant execute on function f_filiale_corriger(
    id_metier, integer, text, text, text, text, text, text, text, text, text, text, date, text
) to grc_app;

comment on function f_filiale_corriger(
    id_metier, integer, text, text, text, text, text, text, text, text, text, text, date, text
) is
    'Corrige l''identité administrative d''une filiale, HORS de tout périmètre de session. '
    'PostgreSQL applique les politiques de SELECT à un « update » qui référence des '
    'colonnes : la filiale qu''un administrateur vient de créer était précisément celle '
    'qu''il ne pouvait pas corriger, et le produit répondait « modifiée entre-temps par '
    'quelqu''un d''autre » — une accusation fausse. Ne touche ni au code (il nomme les '
    'groupes d''annuaire), ni au statut (la sortie exporte d''abord), ni à la version (le '
    'déclencheur en est l''auteur). « null » laisse inchangé ; la chaîne vide efface. '
    'La barrière est la déclaration d''accès de la route (migration 067).';

-- =====================================================================================
-- §2 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('067', 'corriger une filiale que la session ne lit pas : PostgreSQL applique les '
               'politiques de SELECT à un « update » qui référence des colonnes, et la '
               'filiale qu''on vient de créer était celle qu''on ne pouvait pas corriger — '
               'le produit accusait un tiers qui n''existait pas')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_filiale_corriger(id_metier, integer, text, text, text, text,
--        text, text, text, text, text, text, date, text);
--   delete from migrations_schema where version = '067';
--   commit;
-- ⚠️ Annuler REMET le défaut, et sous sa forme la plus trompeuse : un refus « modifiée
--    entre-temps » sur une filiale que personne n'a touchée.
-- =====================================================================================
