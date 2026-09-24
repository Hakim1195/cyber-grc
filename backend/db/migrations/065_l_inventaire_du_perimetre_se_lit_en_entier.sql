-- =====================================================================================
--  065 — L'INVENTAIRE DU PÉRIMÈTRE SE LIT EN ENTIER, ET C'EST LE CLIC QUI L'A DIT
--
--  §1  La fonction
--  §2  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — trouvée EN CLIQUANT, après un banc vert
--
--  L'écran « Filiales » livré le 24/09/2026 rend l'inventaire du périmètre. Sa première
--  rédaction lisait `select … from filiales` — la lecture la plus évidente, et elle est
--  fausse.
--
--  🛑 **MESURÉ SUR LA RECETTE, AU NAVIGATEUR** : une filiale créée depuis l'écran
--  n'apparaissait PAS dans la liste, tandis que l'encart au-dessus annonçait sa création
--  avec ses huit groupes d'annuaire à créer. **L'écran se contredisait lui-même** — et
--  dans le sens le plus coûteux : un administrateur en conclut que la création a échoué,
--  la refait, et reçoit un refus de doublon sur un code qu'il ne voit nulle part.
--
--  ── LE MÉCANISME, ET IL ÉTAIT DÉJÀ ÉCRIT DANS LE PRODUIT ─────────────────────────
--
--  `pol_filiales_lecture` dit :
--
--      when f_est_proprietaire_base() then true
--      when f_perimetre_groupe()      then true
--      else id = any (f_filiales_lecture())
--
--  et `f_perimetre_groupe()` est **dérivée** : elle vaut vrai quand le périmètre couvre
--  TOUTES les filiales actives. Créer une filiale active en ajoute une que le périmètre
--  de la session ne couvre pas — la fonction bascule donc à **faux**, et la politique
--  retombe sur la liste des filiales lisibles, où la nouvelle n'est pas.
--
--  ⚠️ **Le commentaire de `creerFiliale()` décrivait ce piège en vingt lignes**, à propos
--  du `returning` de l'insertion. Il ne disait pas que la LECTURE de l'écran tomberait
--  dans le même trou. *Un piège décrit à un endroit n'est pas un piège fermé* — c'est le
--  motif du `CLAUDE.md` §8, et c'est la troisième fois qu'il se paie ainsi.
--
--  ── CE QUE CETTE FONCTION OUVRE, ET CE QU'ELLE N'OUVRE PAS ───────────────────────
--
--  Elle rend **l'identité administrative** des filiales du groupe — code, raison sociale,
--  pays, statut, dates d'entrée et de sortie — hors de tout périmètre de session.
--
--  ⚠️ Elle n'ouvre **aucune donnée métier** : ni risque, ni actif, ni document, ni une
--  seule ligne d'une table cloisonnée. La cartographie des sociétés du groupe est
--  précisément ce qu'un administrateur d'application doit voir — il en crée et en fait
--  sortir —, et c'est ce que `deploy/groupes-ad.sh` imprime déjà dans chaque nom de
--  groupe qu'il engendre.
--
--  ⚠️ **Elle est réservée à `grc_app`**, pas accordée à `grc_lecture` : le rôle de
--  supervision n'a pas d'écran, et `f_filiales_actives()` lui suffit. Un privilège qui ne
--  sert à personne est une surface qu'on entretient sans raison.
--
--  🛑 **Et la barrière n'est PAS cette fonction : c'est la déclaration d'accès de la
--  route.** `GET /api/filiales/inventaire` exige le domaine `administration`, et le
--  crochet `onRequest` le constate avant que la moindre ligne soit lue. Une fonction
--  `security definer` est un contournement LÉGITIME du cloisonnement, jamais un droit :
--  ce qui décide du droit est le modèle à trois axes, et lui seul.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LA FONCTION
-- =====================================================================================

create or replace function f_filiales_inventaire()
returns table (
    id              id_metier,
    code            text,
    raison_sociale  text,
    pays            text,
    statut          text,
    date_entree     date,
    date_sortie     date
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    -- L'ordre est celui de l'écran : les actives d'abord, puis le reste par code.
    -- Le trier ici plutôt qu'en TypeScript évite qu'un second tri diverge du premier.
    select f.id, f.code, f.raison_sociale, f.pays, f.statut, f.date_entree, f.date_sortie
      from filiales f
     order by case f.statut when 'active' then 0 else 1 end, f.code;
$$;

-- PostgreSQL accorde EXECUTE à PUBLIC par défaut. Une fonction « security definer »
-- s'exécute sous le propriétaire : la laisser joignable par tous annulerait le
-- cloisonnement qu'elle contourne légitimement (constat Q-136).
revoke all on function f_filiales_inventaire() from public;
grant execute on function f_filiales_inventaire() to grc_app;

comment on function f_filiales_inventaire() is
    'L''identité administrative de TOUTES les filiales, tous statuts, hors de tout '
    'périmètre de session — ce que l''écran « Filiales » affiche. Une filiale créée fait '
    'basculer f_perimetre_groupe() à faux dans la session qui la crée, et un select '
    'direct sur « filiales » perdait alors la ligne qu''on venait d''écrire : l''écran '
    'se contredisait lui-même (migration 065, trouvé en cliquant). Aucune donnée métier '
    'n''est ouverte ; la barrière est la déclaration d''accès de la route.';

-- =====================================================================================
-- §2 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('065', 'l''inventaire du périmètre se lit en entier : une filiale créée fait '
               'basculer f_perimetre_groupe() à faux, et l''écran perdait la ligne '
               'qu''il venait de créer — en annonçant sa création juste au-dessus')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_filiales_inventaire();
--   delete from migrations_schema where version = '065';
--   commit;
-- ⚠️ Annuler REMET la contradiction : l'écran « Filiales » perdra la filiale qu'il vient
--    de créer, tout en annonçant sa création.
-- =====================================================================================
