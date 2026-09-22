-- =====================================================================================
--  063 — UNE FICHE IMPORTÉE GARDE L'ENTRÉE D'ANNUAIRE QU'ELLE REFLÈTE
--
--  §0  Le périmètre de la migration
--  §1  La colonne, et l'unicité qui la tient
--  §2  Le registre de l'article 30
--  §3  Le garde-fou
--  §4  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — et elle a été trouvée EN CLIQUANT
--
--  L'import depuis l'annuaire, livré le 22/09/2026, crée la fiche d'un salarié avec son
--  nom, sa fonction et son service tels que l'Active Directory les porte. Mesuré sur la
--  recette, sur un compte créé pour l'occasion : la fiche « Alix Perrin, Responsable
--  maintenance, Production » entre correctement.
--
--  🛑 **ET ELLE N'EST RATTACHÉE À RIEN.** `personnes.utilisateur_id` désigne un compte
--  APPLICATIF, et un compte applicatif n'existe qu'à partir de la PREMIÈRE CONNEXION de
--  son titulaire (provisionnement, `PLAN_SERVEUR` §1.5). Or l'import vise précisément les
--  gens qui **ne se connectent jamais** — c'est sa raison d'être.
--
--  Deux conséquences, et aucune ne se voyait :
--
--   1. l'écran ne peut pas dire qu'une fiche vient de l'annuaire : elle est
--      indiscernable d'une saisie à la main, et quelqu'un la réécrira ;
--   2. **le rafraîchissement ne la voit pas** — il parcourt les fiches rattachées à un
--      compte. Une mutation, un changement de service, un DÉPART ne remonteraient
--      jamais, sur les fiches qui en ont le plus besoin.
--
--  ── ⚠️ POURQUOI PAS UNE LIGNE DANS `utilisateurs` ────────────────────────────────
--
--  C'était la réponse courte, et elle est fausse : `utilisateurs` est la table des
--  COMPTES DU PRODUIT. Y créer une ligne pour quelqu'un qui n'a jamais ouvert de session
--  le ferait apparaître dans l'écran des habilitations comme un compte existant, avec sa
--  « dernière connexion » vide — et un administrateur lui chercherait des droits. *Une
--  table qui répond à une question ne doit pas se mettre à en répondre une autre.*
--
--  La fiche garde donc le LOGIN qu'elle reflète. Les deux liens coexistent et ne disent
--  pas la même chose :
--
--    · `utilisateur_id`  — « cette personne a un COMPTE dans le produit » ;
--    · `login_annuaire`  — « cette fiche MIROITE cette entrée d'annuaire ».
--
--  Le premier se pose à la connexion, le second à l'import. Une personne importée puis
--  connectée porte les deux, et `synchroniserAnnuaire()` la retrouve par son nom — le
--  chemin de reprise écrit au lot L3, qui continue de fonctionner sans être touché.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Le §1 crée un index unique sur une table CLOISONNÉE, ce qui la parcourt. Sans
-- périmètre, il ne verrait aucune ligne et la migration passerait pour un mauvais motif
-- (`CONVENTIONS.md` §42).
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-063', true);
    perform set_config('grc.filiales',
                       coalesce((select string_agg(id, ',') from filiales), ''), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LA COLONNE, ET L'UNICITÉ QUI LA TIENT
-- =====================================================================================

alter table personnes add column if not exists login_annuaire text;

alter table personnes drop constraint if exists ck_personnes_login_annuaire;
alter table personnes add constraint ck_personnes_login_annuaire check (
    login_annuaire is null or (login_annuaire <> '' and length(login_annuaire) <= 256));

-- ⚠️ **Unicité PAR FILIALE, et partielle.**
--
--  · **par filiale** : la même personne peut légitimement avoir une fiche dans deux
--    filiales — un DPO de Groupe, un responsable transverse. Une unicité globale les
--    interdirait, et c'est le contraire de ce que le modèle MIXTE veut dire ;
--  · **partielle** (`where login_annuaire is not null`) : les fiches saisies à la main
--    n'en portent pas, et sans la clause elles se disputeraient toutes le même « rien ».
--    C'est le pendant du piège `nulls not distinct` du `CONVENTIONS.md` §45, pris par
--    l'autre bout : ici on VEUT que les nuls soient distincts ;
--  · **`lower()`** : l'annuaire est insensible à la casse, et « J.Martin » ne doit pas
--    créer une seconde fiche à côté de « j.martin ».
create unique index if not exists uq_personnes_login_annuaire
    on personnes (filiale_id, lower(login_annuaire))
    where login_annuaire is not null;

comment on column personnes.login_annuaire is
    'Identifiant de connexion (sAMAccountName) de l''entrée d''annuaire que cette fiche '
    'MIROITE. ⚠️ À ne pas confondre avec « utilisateur_id », qui désigne un COMPTE DU '
    'PRODUIT : un compte n''existe qu''à partir de la première connexion, et l''import '
    'vise précisément les gens qui ne se connectent jamais. Les deux coexistent et ne '
    'disent pas la même chose. Posé par l''import et par le rafraîchissement '
    '(src/personnel/), jamais par la saisie.';

-- =====================================================================================
-- §2 — LE REGISTRE DE L'ARTICLE 30 DU PRODUIT LUI-MÊME
-- -------------------------------------------------------------------------------------
-- ⚠️ **C'est une donnée personnelle, et une décision franche.** Un identifiant de
-- connexion désigne une personne aussi sûrement que son nom — c'est même ce qu'on
-- emploie quand le nom ne suffit pas. Régime « anonymiser » : l'effacer détruirait la
-- fiche, la conserver telle quelle passé la rétention n'a pas de justification.
-- =====================================================================================

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('personnes', 'login_annuaire', 'personnelle',
   'Rattacher une fiche d''annuaire à l''entrée de l''Active Directory qu''elle reflète, '
   'pour la remettre à jour et signaler un départ.',
   'Intérêt légitime', 1095, 'anonymiser',
   'Identifiant de connexion : il désigne une personne aussi sûrement que son nom. '
   '⚠️ « anonymiser » et non « supprimer » : effacer la ligne détruirait la fiche, et '
   'une personne partie porte encore des actions et des documents (issue (a) du constat '
   'Q-284).')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §3 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- Deux propriétés, et chacune ferme un défaut silencieux :
--
--  1. l'unicité est PARTIELLE et porte `filiale_id` — sans la clause partielle, toutes
--     les fiches saisies à la main se disputeraient le même « rien » et la deuxième
--     serait refusée ; sans `filiale_id`, un responsable transverse ne pourrait pas
--     avoir de fiche dans deux filiales ;
--  2. un login VIDE est refusé — une chaîne vide n'est pas « pas de login » : elle
--     passerait l'unicité partielle et ferait croire à un rattachement.
-- =====================================================================================

create or replace function f_verifier_login_annuaire()
returns table(objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_verdict boolean;
    r         record;
begin
    select i.indpred is not null                                        as partielle,
           exists (select 1 from pg_attribute a
                    where a.attrelid = i.indrelid and a.attname = 'filiale_id'
                      and a.attnum = any (i.indkey))                    as porte_filiale
      into r
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where c.relname = 'uq_personnes_login_annuaire';

    if r is null then
        objet    := 'personnes';
        anomalie := 'unicite_login_absente';
        detail   := 'uq_personnes_login_annuaire est absente : deux imports successifs '
                    'créeraient deux fiches pour la même personne, et l''annuaire du '
                    'produit se remplirait de doublons que personne ne voit';
        return next;
    else
        if not r.partielle then
            objet    := 'personnes';
            anomalie := 'unicite_login_non_partielle';
            detail   := 'l''unicité n''est pas partielle : toutes les fiches SAISIES À LA '
                        'MAIN, qui ne portent aucun login, se disputeraient le même '
                        '« rien » — et la deuxième serait refusée sans que le message le '
                        'dise (CONVENTIONS.md §45, pris par l''autre bout)';
            return next;
        end if;
        if not r.porte_filiale then
            objet    := 'personnes';
            anomalie := 'unicite_login_hors_filiale';
            detail   := 'l''unicité ne porte pas « filiale_id » : un responsable '
                        'transverse — un DPO de Groupe — ne pourrait pas avoir de fiche '
                        'dans deux filiales, ce que le modèle MIXTE autorise justement';
            return next;
        end if;
    end if;

    -- Un login VIDE n'est pas « pas de login » : il passerait l'unicité partielle et
    -- ferait croire à un rattachement. Éprouvé sur le prédicat RÉEL (§39.1).
    v_verdict := f_contrainte_accepte('personnes', 'ck_personnes_login_annuaire',
                                      jsonb_build_object('login_annuaire', ''));
    if v_verdict is null then
        objet    := 'personnes';
        anomalie := 'contrainte_login_non_mesurable';
        detail   := 'ck_personnes_login_annuaire est absente, ou son prédicat appelle une '
                    'fonction que ce garde refuse d''évaluer (constat A-4)';
        return next;
    elsif v_verdict then
        objet    := 'personnes';
        anomalie := 'login_vide_admis';
        detail   := 'un login d''annuaire VIDE est accepté : la fiche paraîtrait rattachée '
                    'à une entrée d''annuaire, et le rafraîchissement irait chercher un '
                    'compte qui n''a pas de nom';
        return next;
    end if;

    -- Le contre-témoin : un login légitime doit passer, et le NUL aussi — une fiche
    -- saisie à la main n'en porte aucun, et lui en exiger un la rendrait inécrivable.
    v_verdict := f_contrainte_accepte('personnes', 'ck_personnes_login_annuaire',
                                      jsonb_build_object('login_annuaire', 'j.martin'));
    if v_verdict is not null and not v_verdict then
        objet    := 'personnes';
        anomalie := 'login_legitime_refuse';
        detail   := 'un login d''annuaire ordinaire est REFUSÉ : l''import serait '
                    'impossible, et le garde-fou se tairait — ce qu''il fait aussi quand '
                    'tout va bien';
        return next;
    end if;
    v_verdict := f_contrainte_accepte('personnes', 'ck_personnes_login_annuaire',
                                      jsonb_build_object('login_annuaire', null));
    if v_verdict is not null and not v_verdict then
        objet    := 'personnes';
        anomalie := 'login_obligatoire';
        detail   := 'le login d''annuaire est devenu obligatoire : les fiches saisies à la '
                    'main deviendraient inécrivables, et l''écran refuserait d''enregistrer '
                    'sans désigner la cause (motif Q-192)';
        return next;
    end if;
end;
$$;

comment on function f_verifier_login_annuaire() is
    'Garde-fou de la 063 : l''unicité du login d''annuaire est PARTIELLE et porte '
    'filiale_id — sans la clause partielle, les fiches saisies à la main se disputeraient '
    'le même « rien » ; sans filiale_id, un responsable transverse ne pourrait pas avoir '
    'de fiche dans deux filiales. Et un login VIDE est refusé, éprouvé sur le prédicat '
    'RÉEL avec ses DEUX contre-témoins — le login ordinaire et le NUL.';

grant execute on function f_verifier_login_annuaire() to grc_app;

-- =====================================================================================
-- §4 — CONSIGNATION
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
        raise exception 'Le schéma est en défaut après 063 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, login d''annuaire compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('063', 'une fiche importée garde l''entrée d''annuaire qu''elle reflète : sans ce '
               'login, elle était indiscernable d''une saisie à la main et le '
               'rafraîchissement ne la voyait pas — sur les fiches qui en ont le plus '
               'besoin, celles des gens qui ne se connectent jamais')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_login_annuaire();
--   delete from controles_schema where fonction = 'f_verifier_login_annuaire';
--   drop index if exists uq_personnes_login_annuaire;
--   alter table personnes drop constraint if exists ck_personnes_login_annuaire;
--   alter table personnes drop column if exists login_annuaire;
--   delete from colonnes_personnelles where table_nom = 'personnes'
--         and colonne = 'login_annuaire';
--   delete from migrations_schema where version = '063';
--   commit;
-- ⚠️ Annuler ne détruit aucune fiche : seul le RATTACHEMENT à l'annuaire est perdu, et
--    avec lui la possibilité de rafraîchir. Les fiches redeviennent ce qu'elles étaient
--    avant le 22/09/2026 — des saisies que rien ne remet à jour.
-- =====================================================================================
